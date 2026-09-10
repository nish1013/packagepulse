import json
from collections.abc import Callable
from typing import Any

import httpx
import respx
from httpx import AsyncClient

Fixture = Callable[[str], Any]
Sse = Callable[[str], list[tuple[str, dict[str, Any]]]]


def mock_upstreams(fixture: Fixture) -> None:
    respx.get("https://pypi.org/pypi/fastapi/json").mock(
        return_value=httpx.Response(200, json=fixture("pypi_fastapi.json"))
    )
    respx.get("https://pypi.org/pypi/pycrypto/json").mock(
        return_value=httpx.Response(200, json=fixture("pypi_pycrypto.json"))
    )
    respx.get("https://pypi.org/pypi/not-a-package/json").mock(return_value=httpx.Response(404))

    def osv(request: httpx.Request) -> httpx.Response:
        name = json.loads(request.content)["package"]["name"]
        return httpx.Response(200, json=fixture("osv_pycrypto.json") if name == "pycrypto" else {})

    respx.post("https://api.osv.dev/v1/query").mock(side_effect=osv)
    respx.route(host="api.deps.dev").mock(return_value=httpx.Response(404))
    respx.route(host="api.github.com").mock(return_value=httpx.Response(404))
    respx.route(host="api.securityscorecards.dev").mock(return_value=httpx.Response(404))


@respx.mock
async def test_scans_a_manifest_and_ranks_what_to_fix_first(
    api: AsyncClient, fixture: Fixture, sse: Sse
) -> None:
    mock_upstreams(fixture)

    response = await api.post("/v1/scans", json={"manifest": "fastapi\npycrypto\nnot-a-package\n"})

    assert response.status_code == 200
    events = sse(response.text)
    names = [name for name, _ in events]
    assert names[0] == "scan_start"
    assert names[-1] == "summary"
    assert names.count("package") == 2
    assert names.count("package_failed") == 1

    failed = next(data for name, data in events if name == "package_failed")
    assert failed["name"] == "not-a-package"
    assert failed["code"] == "not_found"

    summary = events[-1][1]
    assert summary["total"] == 3
    assert summary["checked"] == 2
    assert summary["fix_first"][0]["name"] == "pycrypto"
    assert "2 known vulnerabilities in 2.6.1" in summary["fix_first"][0]["reasons"]


async def test_rejects_oversized_manifests(api: AsyncClient) -> None:
    response = await api.post("/v1/scans", json={"manifest": "a" * 64_001})

    assert response.status_code == 413
    assert response.json()["code"] == "manifest_too_large"
