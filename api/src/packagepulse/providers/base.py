from __future__ import annotations

import asyncio
import contextlib
import hashlib
import json
import random
import time
from collections import OrderedDict
from collections.abc import Awaitable, Callable, Mapping
from dataclasses import dataclass, field, replace
from typing import Any

import httpx

from packagepulse.cache import Cache, MemoryTTLCache, SingleFlight

RETRYABLE_STATUS = frozenset({429, 500, 502, 503, 504})
DEFAULT_CONCURRENCY: Mapping[str, int] = {
    "registry": 16,
    "osv": 8,
    "depsdev": 8,
    "dependents": 8,
    "github": 4,
    "scorecard": 8,
}


@dataclass(frozen=True, slots=True)
class Response:
    status: int
    data: Any = None
    headers: Mapping[str, str] = field(default_factory=dict)
    ms: int = 0
    cached: bool = False
    error: str | None = None

    @property
    def ok(self) -> bool:
        return self.status == 200


class CircuitBreaker:
    def __init__(
        self, threshold: int = 5, cooldown_s: float = 30.0, clock: Callable[[], float] = time.monotonic
    ) -> None:
        self._threshold = threshold
        self._cooldown_s = cooldown_s
        self._clock = clock
        self._failures = 0
        self._open_until = 0.0

    def allow(self) -> bool:
        return self._clock() >= self._open_until

    def record(self, *, success: bool) -> None:
        if success:
            self._failures = 0
            return
        self._failures += 1
        if self._failures >= self._threshold:
            self._open_until = self._clock() + self._cooldown_s
            self._failures = 0


def cache_key(method: str, url: str, body: Mapping[str, Any] | None) -> str:
    if body is None:
        return f"{method} {url}"
    digest = hashlib.sha256(json.dumps(body, sort_keys=True).encode()).hexdigest()[:16]
    return f"{method} {url} {digest}"


class Upstream:
    """HTTP client shared by all providers. Upstream failures are returned, never raised."""

    def __init__(
        self,
        client: httpx.AsyncClient,
        cache: Cache[Response] | None = None,
        *,
        concurrency: Mapping[str, int] = DEFAULT_CONCURRENCY,
        attempt_timeout_s: float = 6.0,
        budget_s: float = 12.0,
        retries: int = 2,
        not_found_ttl_s: float = 600.0,
        clock: Callable[[], float] = time.monotonic,
        sleep: Callable[[float], Awaitable[None]] = asyncio.sleep,
        jitter: Callable[[], float] = random.random,
    ) -> None:
        self._client = client
        self._cache: Cache[Response] = cache if cache is not None else MemoryTTLCache()
        self._concurrency = concurrency
        self._attempt_timeout_s = attempt_timeout_s
        self._budget_s = budget_s
        self._retries = retries
        self._not_found_ttl_s = not_found_ttl_s
        self._clock = clock
        self._sleep = sleep
        self._jitter = jitter
        self._gates: dict[str, asyncio.Semaphore] = {}
        self._breakers: dict[str, CircuitBreaker] = {}
        self._flight: SingleFlight[Response] = SingleFlight()
        self._etags: OrderedDict[str, tuple[str, Response]] = OrderedDict()

    async def request(
        self,
        provider: str,
        method: str,
        url: str,
        *,
        ttl_s: float,
        json_body: Mapping[str, Any] | None = None,
        headers: Mapping[str, str] | None = None,
        conditional: bool = False,
    ) -> Response:
        key = cache_key(method, url, json_body)
        if (hit := await self._cache.get(key)) is not None:
            return replace(hit.value, cached=True, ms=0)
        return await self._flight.do(
            key, lambda: self._fetch(provider, key, method, url, ttl_s, json_body, headers, conditional)
        )

    async def _fetch(
        self,
        provider: str,
        key: str,
        method: str,
        url: str,
        ttl_s: float,
        json_body: Mapping[str, Any] | None,
        headers: Mapping[str, str] | None,
        conditional: bool,
    ) -> Response:
        breaker = self._breakers.setdefault(provider, CircuitBreaker(clock=self._clock))
        if not breaker.allow():
            return Response(0, error="circuit_open")

        started = self._clock()
        async with self._gate(provider):
            try:
                async with asyncio.timeout(self._budget_s):
                    response = await self._attempts(
                        key, method, url, json_body, headers, conditional, started
                    )
            except TimeoutError:
                response = Response(0, ms=self._elapsed_ms(started), error="timeout")

        breaker.record(success=response.status != 0 and response.status not in RETRYABLE_STATUS)
        if response.status == 200:
            await self._cache.set(key, response, ttl_s)
        elif response.status == 404:
            await self._cache.set(key, response, min(ttl_s, self._not_found_ttl_s))
        return response

    async def _attempts(
        self,
        key: str,
        method: str,
        url: str,
        json_body: Mapping[str, Any] | None,
        headers: Mapping[str, str] | None,
        conditional: bool,
        started: float,
    ) -> Response:
        for attempt in range(self._retries + 1):
            request_headers = dict(headers or {})
            known = self._etags.get(key) if conditional else None
            if known is not None:
                request_headers["If-None-Match"] = known[0]

            try:
                async with asyncio.timeout(self._attempt_timeout_s):
                    raw = await self._client.request(method, url, json=json_body, headers=request_headers)
            except (httpx.TransportError, TimeoutError) as exc:
                error = "timeout" if isinstance(exc, TimeoutError | httpx.TimeoutException) else "network"
                if attempt < self._retries:
                    await self._backoff(attempt, None)
                    continue
                return Response(0, ms=self._elapsed_ms(started), error=error)

            if raw.status_code == 304 and known is not None:
                self._etags.move_to_end(key)
                return replace(known[1], headers=dict(raw.headers), ms=self._elapsed_ms(started))

            if raw.status_code in RETRYABLE_STATUS and attempt < self._retries:
                await self._backoff(attempt, raw.headers.get("retry-after"))
                continue

            response = self._to_response(raw, started)
            if conditional and response.ok and (etag := raw.headers.get("etag")):
                self._remember_etag(key, etag, response)
            return response

        raise AssertionError("unreachable")  # pragma: no cover

    def _to_response(self, raw: httpx.Response, started: float) -> Response:
        data: Any = None
        error = None
        if "json" in raw.headers.get("content-type", ""):
            try:
                data = raw.json()
            except ValueError:
                error = "invalid_json"
        return Response(raw.status_code, data, dict(raw.headers), self._elapsed_ms(started), error=error)

    async def _backoff(self, attempt: int, retry_after: str | None) -> None:
        delay = self._jitter() * 0.3 * 2**attempt
        if retry_after is not None:
            with contextlib.suppress(ValueError):
                delay = min(float(retry_after), 2.0)
        await self._sleep(delay)

    def _remember_etag(self, key: str, etag: str, response: Response) -> None:
        self._etags[key] = (etag, response)
        self._etags.move_to_end(key)
        while len(self._etags) > 2000:
            self._etags.popitem(last=False)

    def _gate(self, provider: str) -> asyncio.Semaphore:
        if provider not in self._gates:
            self._gates[provider] = asyncio.Semaphore(self._concurrency.get(provider, 8))
        return self._gates[provider]

    def _elapsed_ms(self, started: float) -> int:
        return round((self._clock() - started) * 1000)
