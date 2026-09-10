from collections.abc import AsyncIterator

import httpx
import pytest
import respx

from packagepulse.providers.base import CircuitBreaker, Upstream

URL = "https://example.test/item"


class FakeClock:
    def __init__(self) -> None:
        self.now = 0.0

    def __call__(self) -> float:
        return self.now


async def no_sleep(_: float) -> None:
    return None


@pytest.fixture
async def client() -> AsyncIterator[httpx.AsyncClient]:
    async with httpx.AsyncClient() as http:
        yield http


def make_upstream(client: httpx.AsyncClient, retries: int = 2) -> Upstream:
    return Upstream(client, retries=retries, sleep=no_sleep, jitter=lambda: 0.0)


@respx.mock
async def test_caches_successful_responses(client: httpx.AsyncClient) -> None:
    route = respx.get(URL).mock(return_value=httpx.Response(200, json={"name": "fastapi"}))
    upstream = make_upstream(client)

    first = await upstream.request("registry", "GET", URL, ttl_s=60)
    second = await upstream.request("registry", "GET", URL, ttl_s=60)

    assert first.ok
    assert not first.cached
    assert second.cached
    assert second.data == {"name": "fastapi"}
    assert route.call_count == 1


@respx.mock
async def test_retries_retryable_statuses_then_succeeds(client: httpx.AsyncClient) -> None:
    route = respx.get(URL).mock(
        side_effect=[httpx.Response(503), httpx.Response(429), httpx.Response(200, json={"ok": True})]
    )

    response = await make_upstream(client).request("osv", "GET", URL, ttl_s=60)

    assert response.ok
    assert route.call_count == 3


@respx.mock
async def test_returns_the_last_status_after_retries(client: httpx.AsyncClient) -> None:
    respx.get(URL).mock(return_value=httpx.Response(502))

    response = await make_upstream(client, retries=1).request("osv", "GET", URL, ttl_s=60)

    assert response.status == 502
    assert not response.ok


@respx.mock
async def test_reports_timeouts(client: httpx.AsyncClient) -> None:
    respx.get(URL).mock(side_effect=httpx.ReadTimeout("slow"))

    response = await make_upstream(client).request("github", "GET", URL, ttl_s=60)

    assert response.status == 0
    assert response.error == "timeout"


@respx.mock
async def test_caches_not_found(client: httpx.AsyncClient) -> None:
    route = respx.get(URL).mock(return_value=httpx.Response(404, json={"message": "Not Found"}))
    upstream = make_upstream(client)

    await upstream.request("github", "GET", URL, ttl_s=60)
    again = await upstream.request("github", "GET", URL, ttl_s=60)

    assert again.status == 404
    assert again.cached
    assert route.call_count == 1


@respx.mock
async def test_revalidates_with_etag(client: httpx.AsyncClient) -> None:
    route = respx.get(URL).mock(
        side_effect=[
            httpx.Response(200, json={"stars": 10}, headers={"ETag": '"abc"'}),
            httpx.Response(304),
        ]
    )
    upstream = make_upstream(client)

    await upstream.request("github", "GET", URL, ttl_s=0, conditional=True)
    revalidated = await upstream.request("github", "GET", URL, ttl_s=0, conditional=True)

    assert route.calls[1].request.headers["If-None-Match"] == '"abc"'
    assert revalidated.ok
    assert revalidated.data == {"stars": 10}


@respx.mock
async def test_marks_invalid_json(client: httpx.AsyncClient) -> None:
    respx.get(URL).mock(
        return_value=httpx.Response(200, text="{oops", headers={"content-type": "application/json"})
    )

    response = await make_upstream(client).request("registry", "GET", URL, ttl_s=60)

    assert response.error == "invalid_json"
    assert response.data is None


@respx.mock
async def test_open_circuit_skips_the_provider(client: httpx.AsyncClient) -> None:
    route = respx.get(URL).mock(return_value=httpx.Response(503))
    upstream = make_upstream(client, retries=0)

    for _ in range(5):
        await upstream.request("scorecard", "GET", URL, ttl_s=60)
    skipped = await upstream.request("scorecard", "GET", URL, ttl_s=60)

    assert skipped.error == "circuit_open"
    assert route.call_count == 5


def test_circuit_breaker_closes_after_cooldown() -> None:
    clock = FakeClock()
    breaker = CircuitBreaker(threshold=2, cooldown_s=30, clock=clock)

    breaker.record(success=False)
    breaker.record(success=False)
    assert not breaker.allow()

    clock.now += 30
    assert breaker.allow()
