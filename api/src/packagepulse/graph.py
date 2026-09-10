from __future__ import annotations

import asyncio
import logging
import time
from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import Any
from urllib.parse import quote

from fastapi import APIRouter
from fastapi.responses import JSONResponse, Response

from packagepulse.domain import Ecosystem, PackageContext
from packagepulse.orchestrator import Orchestrator, Profile
from packagepulse.providers.base import Upstream
from packagepulse.providers.depsdev import DEPS_DEV
from packagepulse.registries.npm import NpmRegistry
from packagepulse.registries.pypi import PyPIRegistry
from packagepulse.routes import OrchestratorDep, VersionQuery, is_bare_scope, report_or_problem, validate_name
from packagepulse.schemas import PackageReport
from packagepulse.security.rate_limit import ClientIp, LimitsDep
from packagepulse.sse import SseEvent, sse_response

logger = logging.getLogger(__name__)

MAX_NODES = 200
MAX_SCORED = 25
SCORING_CONCURRENCY = 6
GRAPH_DEADLINE_S = 20.0
NODE_DEADLINE_S = 15.0
RELATION_ORDER = {"SELF": 0, "DIRECT": 1, "INDIRECT": 2}

router = APIRouter(prefix="/v1", tags=["packages"])


@dataclass(frozen=True, slots=True)
class Node:
    id: str
    name: str
    version: str
    relation: str


@dataclass(frozen=True, slots=True)
class Edge:
    source: str
    target: str
    requirement: str


@dataclass(frozen=True, slots=True)
class DependencyGraph:
    nodes: tuple[Node, ...]
    edges: tuple[Edge, ...]
    truncated: bool


@router.get("/packages/{ecosystem}/{name:path}/graph", response_model=None)
async def package_graph(
    ecosystem: Ecosystem,
    name: str,
    orchestrator: OrchestratorDep,
    limits: LimitsDep,
    client: ClientIp,
    version: VersionQuery = None,
) -> Response:
    limits.check(client, limits.package)
    if is_bare_scope(ecosystem, name):
        report = await report_or_problem(orchestrator, ecosystem, f"{name}/graph", version)
        return JSONResponse(report.model_dump(mode="json"))
    name = validate_name(ecosystem, name)
    release = limits.open_stream(client)
    return sse_response(graph_events(orchestrator, ecosystem, name, version), on_close=release)


def build_graph(raw: dict[str, Any], max_nodes: int = MAX_NODES) -> DependencyGraph:
    raw_nodes: list[dict[str, Any]] = raw.get("nodes") or []
    raw_edges: list[dict[str, Any]] = raw.get("edges") or []
    order = sorted(
        range(len(raw_nodes)), key=lambda i: RELATION_ORDER.get(raw_nodes[i].get("relation", ""), 3)
    )
    kept = order[:max_nodes]
    ids = {original: f"n{position}" for position, original in enumerate(kept)}
    nodes = tuple(
        Node(
            id=ids[index],
            name=raw_nodes[index]["versionKey"]["name"],
            version=raw_nodes[index]["versionKey"]["version"],
            relation=raw_nodes[index].get("relation", "INDIRECT"),
        )
        for index in kept
    )
    edges = tuple(
        Edge(ids[edge["fromNode"]], ids[edge["toNode"]], edge.get("requirement", ""))
        for edge in raw_edges
        if edge.get("fromNode") in ids and edge.get("toNode") in ids
    )
    return DependencyGraph(nodes, edges, truncated=len(raw_nodes) > max_nodes)


async def graph_events(
    orchestrator: Orchestrator, ecosystem: Ecosystem, name: str, version: str | None
) -> AsyncIterator[SseEvent]:
    started = time.perf_counter()
    requested = version or await _latest_version(orchestrator.upstream, ecosystem, name)
    if requested is None:
        yield "error", {"code": "not_found", "message": f"{name} was not found on {ecosystem.value}"}
        return

    raw, resolved = await _dependencies(orchestrator.upstream, ecosystem, name, requested)
    if raw is None:
        yield (
            "error",
            {"code": "graph_unavailable", "message": "No dependency graph is available for this version"},
        )
        return

    graph = build_graph(raw)
    yield (
        "graph",
        {
            "root": {"ecosystem": ecosystem.value, "name": name, "version": resolved},
            "requested_version": requested,
            "fallback": resolved != requested,
            "truncated": graph.truncated,
            "nodes": [
                {"id": node.id, "name": node.name, "version": node.version, "relation": node.relation}
                for node in graph.nodes
            ],
            "edges": [
                {"from": edge.source, "to": edge.target, "requirement": edge.requirement}
                for edge in graph.edges
            ],
        },
    )

    gate = asyncio.Semaphore(SCORING_CONCURRENCY)

    async def score(node: Node) -> tuple[Node, PackageReport | None]:
        async with gate:
            try:
                report = await orchestrator.report(
                    ecosystem, node.name, node.version, profile=Profile.LIGHT, deadline_s=NODE_DEADLINE_S
                )
            except Exception:
                logger.exception("scoring %s failed", node.name)
                return node, None
        return node, report

    direct = [node for node in graph.nodes if node.relation == "DIRECT"][:MAX_SCORED]
    tasks = [asyncio.create_task(score(node)) for node in direct]
    scored = 0
    try:
        remaining = max(0.0, GRAPH_DEADLINE_S - (time.perf_counter() - started))
        for next_done in asyncio.as_completed(tasks, timeout=remaining):
            node, report = await next_done
            if report is None or report.version is None:
                continue
            scored += 1
            yield (
                "node_health",
                {
                    "id": node.id,
                    "overall": report.scores.overall,
                    "band": report.scores.band.value,
                    "worst_flag": _worst_flag(report),
                },
            )
    except TimeoutError:
        pass
    finally:
        for task in tasks:
            task.cancel()

    yield (
        "done",
        {
            "scored": scored,
            "unscored": len(graph.nodes) - scored,
            "elapsed_ms": round((time.perf_counter() - started) * 1000),
        },
    )


async def _latest_version(upstream: Upstream, ecosystem: Ecosystem, name: str) -> str | None:
    ctx = PackageContext(ecosystem, name)
    registry = PyPIRegistry() if ecosystem is Ecosystem.PYPI else NpmRegistry()
    await registry.run(ctx, upstream)
    return ctx.version


async def _dependencies(
    upstream: Upstream, ecosystem: Ecosystem, name: str, version: str
) -> tuple[dict[str, Any] | None, str]:
    base = f"{DEPS_DEV}/v3/systems/{ecosystem.value}/packages/{quote(name, safe='')}"
    response = await upstream.request(
        "depsdev", "GET", f"{base}/versions/{quote(version, safe='')}:dependencies", ttl_s=21600
    )
    if response.ok and isinstance(response.data, dict):
        return response.data, version
    if response.status != 404:
        return None, version

    package = await upstream.request("depsdev", "GET", base, ttl_s=21600)
    default = _default_version(package.data) if package.ok else None
    if default is None or default == version:
        return None, version
    fallback = await upstream.request(
        "depsdev", "GET", f"{base}/versions/{quote(default, safe='')}:dependencies", ttl_s=21600
    )
    if fallback.ok and isinstance(fallback.data, dict):
        return fallback.data, default
    return None, version


def _default_version(data: Any) -> str | None:
    if not isinstance(data, dict):
        return None
    for item in data.get("versions") or []:
        if item.get("isDefault"):
            version = (item.get("versionKey") or {}).get("version")
            return str(version) if version else None
    return None


def _worst_flag(report: PackageReport) -> str | None:
    for severity in ("critical", "warning"):
        for flag in report.flags:
            if flag.severity == severity:
                return flag.code
    return None
