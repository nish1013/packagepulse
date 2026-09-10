import json
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import httpx
import pytest
import respx
from httpx import ASGITransport, AsyncClient
from pydantic import ValidationError

from packagepulse.main import create_app
from packagepulse.security.signature import signed_headers
from packagepulse.settings import Settings

SECRET = "0" * 64
PATH = "/v1/packages/pypi/not-a-package"
PYPI_MISSING = "https://pypi.org/pypi/not-a-package/json"


@asynccontextmanager
async def client_for(settings: Settings) -> AsyncIterator[AsyncClient]:
    app = create_app(settings)
    async with (
        app.router.lifespan_context(app),
        AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client,
    ):
        yield client


@pytest.fixture
async def secured() -> AsyncIterator[AsyncClient]:
    async with client_for(
        Settings(env="test", signing_secret=SECRET, package_requests_per_minute=3)
    ) as client:
        yield client


def test_production_requires_a_signing_secret() -> None:
    with pytest.raises(ValidationError, match="PP_SIGNING_SECRET is required"):
        Settings(env="production", signing_secret=None)


def test_short_signing_secrets_are_rejected() -> None:
    with pytest.raises(ValidationError, match="at least 32 characters"):
        Settings(env="test", signing_secret="too-short")


async def test_health_needs_no_signature(secured: AsyncClient) -> None:
    response = await secured.get("/health")

    assert response.status_code == 200


async def test_unsigned_requests_are_rejected(secured: AsyncClient) -> None:
    response = await secured.get(PATH)

    assert response.status_code == 401
    assert response.headers["content-type"] == "application/problem+json"
    assert response.json()["code"] == "missing_signature"


@respx.mock
async def test_signed_requests_reach_the_api(secured: AsyncClient) -> None:
    respx.get(PYPI_MISSING).mock(return_value=httpx.Response(404))

    response = await secured.get(PATH, headers=signed_headers(SECRET, "GET", PATH))

    assert response.status_code == 404
    assert response.json()["code"] == "not_found"


async def test_stale_signatures_are_rejected(secured: AsyncClient) -> None:
    headers = signed_headers(SECRET, "GET", PATH)
    stale = signed_headers(SECRET, "GET", PATH, timestamp=int(headers["x-pp-timestamp"]) - 120)

    response = await secured.get(PATH, headers=stale)

    assert response.json()["code"] == "stale_signature"


async def test_a_tampered_client_ip_is_rejected(secured: AsyncClient) -> None:
    headers = signed_headers(SECRET, "GET", PATH, client_ip="203.0.113.10")
    headers["x-pp-client-ip"] = "198.51.100.99"

    response = await secured.get(PATH, headers=headers)

    assert response.status_code == 401
    assert response.json()["code"] == "bad_signature"


async def test_a_changed_body_is_rejected(secured: AsyncClient) -> None:
    signed_body = json.dumps({"manifest": "fastapi"}).encode()
    headers = signed_headers(SECRET, "POST", "/v1/scans", body=signed_body)

    response = await secured.post("/v1/scans", content=b'{"manifest": "django"}', headers=headers)

    assert response.status_code == 401
    assert response.json()["code"] == "bad_signature"


async def test_replayed_requests_are_rejected(secured: AsyncClient) -> None:
    path = "/v1/packages/pypi/not a name"
    headers = signed_headers(SECRET, "GET", path)

    first = await secured.get(path, headers=headers)
    replayed = await secured.get(path, headers=headers)

    assert first.json()["code"] == "invalid_name"
    assert replayed.status_code == 401
    assert replayed.json()["code"] == "replayed"


async def test_large_bodies_are_rejected(secured: AsyncClient) -> None:
    response = await secured.post("/v1/scans", content=b"x" * 300_000)

    assert response.status_code == 413
    assert response.json()["code"] == "request_too_large"


@respx.mock
async def test_clients_are_rate_limited_by_verified_ip(secured: AsyncClient) -> None:
    respx.get(PYPI_MISSING).mock(return_value=httpx.Response(404))

    def signed(client_ip: str) -> dict[str, str]:
        return signed_headers(SECRET, "GET", PATH, client_ip=client_ip)

    statuses = [(await secured.get(PATH, headers=signed("203.0.113.20"))).status_code for _ in range(4)]
    other_client = await secured.get(PATH, headers=signed("203.0.113.21"))
    limited = await secured.get(PATH, headers=signed("203.0.113.20"))

    assert statuses == [404, 404, 404, 429]
    assert other_client.status_code == 404
    assert limited.json()["code"] == "rate_limited"
    assert limited.headers["Retry-After"].isdigit()


@respx.mock
async def test_stream_slots_are_released_when_a_stream_ends() -> None:
    respx.get(PYPI_MISSING).mock(return_value=httpx.Response(404))
    settings = Settings(env="test", signing_secret=None, streams_per_client=1)

    async with client_for(settings) as client:
        responses = [await client.get(f"{PATH}/stream") for _ in range(3)]

    assert [response.status_code for response in responses] == [200, 200, 200]
    assert all("event: error" in response.text for response in responses)
