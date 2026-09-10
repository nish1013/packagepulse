from collections.abc import Callable
from typing import Any
from urllib.parse import unquote

import httpx
import respx
from httpx import AsyncClient

from packagepulse.graph import build_graph

Fixture = Callable[[str], Any]
Sse = Callable[[str], list[tuple[str, dict[str, Any]]]]

EXPRESS_DEPENDENCIES = "https://api.deps.dev/v3/systems/npm/packages/express/versions/5.2.1:dependencies"


def test_builds_the_express_graph(fixture: Fixture) -> None:
    graph = build_graph(fixture("depsdev_dependencies_express.json"))

    relations = [node.relation for node in graph.nodes]
    assert len(graph.nodes) == 71
    assert len(graph.edges) == 127
    assert relations[0] == "SELF"
    assert relations.count("DIRECT") == 28
    assert not graph.truncated


def test_truncates_large_graphs_but_keeps_direct_dependencies() -> None:
    nodes = [{"versionKey": {"name": "root", "version": "1"}, "relation": "SELF"}]
    nodes += [
        {"versionKey": {"name": f"indirect-{i}", "version": "1"}, "relation": "INDIRECT"} for i in range(300)
    ]
    nodes += [{"versionKey": {"name": f"direct-{i}", "version": "1"}, "relation": "DIRECT"} for i in range(2)]
    edges = [
        {"fromNode": 0, "toNode": 301, "requirement": "^1"},
        {"fromNode": 0, "toNode": 250, "requirement": "^1"},
    ]

    graph = build_graph({"nodes": nodes, "edges": edges}, max_nodes=200)

    names = [node.name for node in graph.nodes]
    assert graph.truncated
    assert len(graph.nodes) == 200
    assert names[:3] == ["root", "direct-0", "direct-1"]
    assert len(graph.edges) == 1


def mock_npm_registry(fixture: Fixture) -> None:
    respx.get("https://registry.npmjs.org/express/latest").mock(
        return_value=httpx.Response(200, json=fixture("npm_express.json"))
    )

    def registry(request: httpx.Request) -> httpx.Response:
        name, _, version = unquote(request.url.raw_path.decode().lstrip("/")).rpartition("/")
        return httpx.Response(200, json={"name": name, "version": version})

    respx.route(host="registry.npmjs.org").mock(side_effect=registry)
    respx.post("https://api.osv.dev/v1/query").mock(return_value=httpx.Response(200, json={}))


@respx.mock
async def test_streams_the_graph_then_scores_direct_dependencies(
    api: AsyncClient, fixture: Fixture, sse: Sse
) -> None:
    mock_npm_registry(fixture)
    respx.get(EXPRESS_DEPENDENCIES).mock(
        return_value=httpx.Response(200, json=fixture("depsdev_dependencies_express.json"))
    )
    respx.route(host="api.deps.dev").mock(return_value=httpx.Response(404))

    response = await api.get("/v1/packages/npm/express/graph")

    events = sse(response.text)
    names = [name for name, _ in events]
    graph = events[0][1]
    assert names[0] == "graph"
    assert names[-1] == "done"
    assert graph["root"]["version"] == "5.2.1"
    assert len(graph["nodes"]) == 71
    assert names.count("node_health") == 25
    assert events[-1][1]["scored"] == 25


@respx.mock
async def test_falls_back_to_the_default_version_when_a_graph_is_missing(
    api: AsyncClient, fixture: Fixture, sse: Sse
) -> None:
    mock_npm_registry(fixture)
    respx.get(EXPRESS_DEPENDENCIES).mock(return_value=httpx.Response(404))
    respx.get("https://api.deps.dev/v3/systems/npm/packages/express").mock(
        return_value=httpx.Response(
            200, json={"versions": [{"versionKey": {"version": "5.1.0"}, "isDefault": True}]}
        )
    )
    respx.get("https://api.deps.dev/v3/systems/npm/packages/express/versions/5.1.0:dependencies").mock(
        return_value=httpx.Response(
            200, json={"nodes": [{"versionKey": {"name": "express", "version": "5.1.0"}, "relation": "SELF"}]}
        )
    )

    events = sse((await api.get("/v1/packages/npm/express/graph")).text)

    graph = events[0][1]
    assert graph["fallback"] is True
    assert graph["root"]["version"] == "5.1.0"
    assert graph["requested_version"] == "5.2.1"


@respx.mock
async def test_reports_unknown_packages(api: AsyncClient, sse: Sse) -> None:
    respx.get("https://registry.npmjs.org/not-a-package/latest").mock(return_value=httpx.Response(404))

    events = sse((await api.get("/v1/packages/npm/not-a-package/graph")).text)

    assert events == [("error", {"code": "not_found", "message": "not-a-package was not found on npm"})]
