from __future__ import annotations

import math
import time
from collections import OrderedDict
from collections.abc import Callable
from dataclasses import dataclass
from typing import Annotated

from fastapi import Depends, Request

from packagepulse.errors import ProblemError


@dataclass(frozen=True, slots=True)
class Rule:
    name: str
    capacity: int
    per_seconds: float


class RateLimiter:
    def __init__(self, clock: Callable[[], float] = time.monotonic, max_keys: int = 100_000) -> None:
        self._buckets: OrderedDict[str, tuple[float, float]] = OrderedDict()
        self._clock = clock
        self._max_keys = max_keys

    def hit(self, client: str, rule: Rule) -> float | None:
        now = self._clock()
        key = f"{rule.name}:{client}"
        tokens, updated = self._buckets.get(key, (float(rule.capacity), now))
        rate = rule.capacity / rule.per_seconds
        tokens = min(float(rule.capacity), tokens + (now - updated) * rate)
        if tokens < 1:
            self._buckets[key] = (tokens, now)
            return (1 - tokens) / rate
        self._buckets[key] = (tokens - 1, now)
        self._buckets.move_to_end(key)
        while len(self._buckets) > self._max_keys:
            self._buckets.popitem(last=False)
        return None


class ConcurrencyLimiter:
    def __init__(self, limit: int) -> None:
        self._limit = limit
        self._active: dict[str, int] = {}

    def try_acquire(self, key: str) -> bool:
        current = self._active.get(key, 0)
        if current >= self._limit:
            return False
        self._active[key] = current + 1
        return True

    def release(self, key: str) -> None:
        remaining = self._active.get(key, 0) - 1
        if remaining > 0:
            self._active[key] = remaining
        else:
            self._active.pop(key, None)


class Limits:
    def __init__(
        self,
        *,
        package_per_minute: int,
        scans_per_10_minutes: int,
        streams_per_client: int,
        concurrent_scans: int,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self.package = Rule("package", package_per_minute, 60)
        self.scan = Rule("scan", scans_per_10_minutes, 600)
        self._limiter = RateLimiter(clock)
        self._streams = ConcurrencyLimiter(streams_per_client)
        self._scans = ConcurrencyLimiter(concurrent_scans)

    def check(self, client: str, rule: Rule) -> None:
        retry_after = self._limiter.hit(client, rule)
        if retry_after is not None:
            seconds = max(1, math.ceil(retry_after))
            raise ProblemError(
                429,
                "rate_limited",
                "Too many requests",
                f"Try again in {seconds} seconds",
                headers={"Retry-After": str(seconds)},
            )

    def open_stream(self, client: str, *, scan: bool = False) -> Callable[[], None]:
        if not self._streams.try_acquire(client):
            raise ProblemError(
                429,
                "too_many_streams",
                "Too many open streams",
                "Wait for another request to finish",
                headers={"Retry-After": "5"},
            )
        if scan and not self._scans.try_acquire("all"):
            self._streams.release(client)
            raise ProblemError(
                503,
                "busy",
                "Busy",
                "Too many scans are running, try again shortly",
                headers={"Retry-After": "10"},
            )
        released = False

        def release() -> None:
            nonlocal released
            if released:
                return
            released = True
            self._streams.release(client)
            if scan:
                self._scans.release("all")

        return release


def get_client_ip(request: Request) -> str:
    verified = getattr(request.state, "client_ip", None)
    if isinstance(verified, str):
        return verified
    return request.client.host if request.client else "unknown"


def get_limits(request: Request) -> Limits:
    limits: Limits = request.app.state.limits
    return limits


ClientIp = Annotated[str, Depends(get_client_ip)]
LimitsDep = Annotated[Limits, Depends(get_limits)]
