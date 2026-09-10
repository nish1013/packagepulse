import json
from collections.abc import AsyncIterator, Callable
from typing import Any

import httpx
import pytest
import respx
from httpx import ASGITransport, AsyncClient

from packagepulse.main import create_app
from packagepulse.settings import Settings

Fixture = Callable[[str], Any]


@pytest.fixture
async def api() -> AsyncIterator[AsyncClient]:
    app = create_app(Settings(env="test"))
    async with (
        app.router.lifespan_context(app),
        AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client,
    ):
        yield client


def parse_sse(text: str) -> list[tuple[str, dict[str, Any]]]:
    events = []
    for block in text.strip().split("\n\n"):
        lines = [line for line in block.splitlines() if not line.startswith(":")]
        if not lines:
            continue
        name = next(line.removeprefix("event: ") for line in lines if line.startswith("event: "))
        data = json.loads(next(line.removeprefix("data: ") for line in lines if line.startswith("data: ")))
        events.append((name, data))
    return events


def mock_fastapi(fixture: Fixture) -> None:
    respx.get("https://pypi.org/pypi/fastapi/json").mock(
        return_value=httpx.Response(200, json=fixture("pypi_fastapi.json"))
    )
    respx.post("https://api.osv.dev/v1/query").mock(return_value=httpx.Response(200, json={}))
    respx.get("https://api.deps.dev/v3/systems/pypi/packages/fastapi/versions/0.141.1").mock(
        return_value=httpx.Response(200, json={"advisoryKeys": []})
    )
    respx.get("https://api.deps.dev/v3alpha/systems/pypi/packages/fastapi/versions/0.141.1:dependents").mock(
        return_value=httpx.Response(200, json={"dependentCount": 20017, "directDependentCount": 14066})
    )
    respx.get("https://api.github.com/repos/fastapi/fastapi").mock(
        return_value=httpx.Response(
            200,
            json={
                "full_name": "fastapi/fastapi",
                "html_url": "https://github.com/fastapi/fastapi",
                "stargazers_count": 102232,
                "open_issues_count": 81,
                "archived": False,
                "pushed_at": "2026-09-02T00:00:00Z",
            },
        )
    )
    respx.get("https://api.securityscorecards.dev/projects/github.com/fastapi/fastapi").mock(
        return_value=httpx.Response(404)
    )


@respx.mock
async def test_returns_a_package_report(api: AsyncClient, fixture: Fixture) -> None:
    mock_fastapi(fixture)

    response = await api.get("/v1/packages/pypi/fastapi")

    assert response.status_code == 200
    report = response.json()
    assert report["version"] == "0.141.1"
    assert report["repository"]["stars"] == 102232
    assert report["scores"]["coverage"] == 1.0
    assert report["sources"]["registry"]["status"] == "ok"
    assert report["sources"]["scorecard"]["status"] == "not_found"


@respx.mock
async def test_streams_provider_events_then_the_report(api: AsyncClient, fixture: Fixture) -> None:
    mock_fastapi(fixture)

    response = await api.get("/v1/packages/pypi/fastapi/stream")

    assert response.headers["content-type"].startswith("text/event-stream")
    events = parse_sse(response.text)
    names = [name for name, _ in events]
    assert names[0] == "start"
    assert names[-1] == "report"
    assert names.count("provider") == 6
    assert events[0][1]["planned"] == ["registry", "osv", "depsdev", "dependents", "github", "scorecard"]


@respx.mock
async def test_unknown_packages_are_not_found(api: AsyncClient) -> None:
    respx.get("https://pypi.org/pypi/no-such-package/json").mock(return_value=httpx.Response(404))

    response = await api.get("/v1/packages/pypi/no-such-package")
    stream = await api.get("/v1/packages/pypi/no-such-package/stream")

    assert response.status_code == 404
    assert response.headers["content-type"] == "application/problem+json"
    assert response.json()["code"] == "not_found"
    assert parse_sse(stream.text)[-1] == (
        "error",
        {"code": "not_found", "message": "no-such-package was not found on pypi"},
    )


async def test_rejects_invalid_names(api: AsyncClient) -> None:
    response = await api.get("/v1/packages/pypi/not a name")

    assert response.status_code == 422
    assert response.json()["code"] == "invalid_name"


async def test_rejects_unsupported_ecosystems(api: AsyncClient) -> None:
    response = await api.get("/v1/packages/cargo/serde")

    assert response.status_code == 422
    assert response.json()["code"] == "invalid_request"


@respx.mock
async def test_supports_scoped_npm_packages(api: AsyncClient, fixture: Fixture) -> None:
    respx.get("https://registry.npmjs.org/@types%2Fnode/latest").mock(
        return_value=httpx.Response(200, json=fixture("npm_types_node.json"))
    )
    respx.post("https://api.osv.dev/v1/query").mock(return_value=httpx.Response(200, json={}))
    respx.route(host="api.deps.dev").mock(return_value=httpx.Response(404))
    respx.route(host="api.github.com").mock(return_value=httpx.Response(404))
    respx.route(host="api.securityscorecards.dev").mock(return_value=httpx.Response(404))

    response = await api.get("/v1/packages/npm/@types/node")

    assert response.status_code == 200
    assert response.json()["name"] == "@types/node"


@respx.mock
async def test_scoped_packages_named_like_an_endpoint_are_packages(api: AsyncClient) -> None:
    route = respx.get("https://registry.npmjs.org/@nivo%2Fstream/latest").mock(
        return_value=httpx.Response(404)
    )

    response = await api.get("/v1/packages/npm/@nivo/stream")

    assert route.called
    assert response.status_code == 404
