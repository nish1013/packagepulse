from __future__ import annotations

import asyncio
import logging
import time
from collections.abc import AsyncIterator, Sequence
from typing import Any

from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from packagepulse.manifests import Dependency, Manifest, parse_manifest
from packagepulse.orchestrator import Orchestrator
from packagepulse.routes import OrchestratorDep
from packagepulse.schemas import PackageReport
from packagepulse.sse import SseEvent, sse_response

logger = logging.getLogger(__name__)

SCAN_CONCURRENCY = 8
SCAN_DEADLINE_S = 120.0
PACKAGE_DEADLINE_S = 30.0
FIX_FIRST_LIMIT = 10
ABANDONED_FLAGS = frozenset({"deprecated", "archived", "repository_missing"})

router = APIRouter(prefix="/v1", tags=["scans"])


class ScanRequest(BaseModel):
    manifest: str = Field(min_length=1, max_length=200_000)


@router.post("/scans", response_model=None)
async def scan(body: ScanRequest, orchestrator: OrchestratorDep) -> StreamingResponse:
    return sse_response(scan_events(orchestrator, parse_manifest(body.manifest)))


async def scan_events(orchestrator: Orchestrator, manifest: Manifest) -> AsyncIterator[SseEvent]:
    started = time.perf_counter()
    dependencies = manifest.dependencies
    yield (
        "scan_start",
        {
            "kind": manifest.kind.value,
            "total": len(dependencies),
            "packages": [
                {"index": index, "ecosystem": dep.ecosystem.value, "name": dep.name, "dev": dep.dev}
                for index, dep in enumerate(dependencies)
            ],
        },
    )

    gate = asyncio.Semaphore(SCAN_CONCURRENCY)

    async def check(index: int, dep: Dependency) -> tuple[int, PackageReport | None, str | None]:
        async with gate:
            try:
                report = await orchestrator.report(dep.ecosystem, dep.name, deadline_s=PACKAGE_DEADLINE_S)
            except Exception:
                logger.exception("scan check for %s failed", dep.name)
                return index, None, "internal_error"
        if report.version is None:
            registry = report.sources.get("registry")
            code = "not_found" if registry and registry.status == "not_found" else "registry_unavailable"
            return index, None, code
        return index, report, None

    tasks = [asyncio.create_task(check(index, dep)) for index, dep in enumerate(dependencies)]
    checked: list[tuple[Dependency, PackageReport]] = []
    reported: set[int] = set()
    try:
        for next_done in asyncio.as_completed(tasks, timeout=SCAN_DEADLINE_S):
            index, report, error = await next_done
            reported.add(index)
            dep = dependencies[index]
            if report is None:
                yield "package_failed", _failure(index, dep, error or "internal_error")
            else:
                checked.append((dep, report))
                yield "package", {"index": index, "dev": dep.dev, "report": report.model_dump(mode="json")}
    except TimeoutError:
        for index, dep in enumerate(dependencies):
            if index not in reported:
                yield "package_failed", _failure(index, dep, "deadline")
    finally:
        for task in tasks:
            task.cancel()

    elapsed_ms = round((time.perf_counter() - started) * 1000)
    sequential_ms = sum(report.timing.sequential_ms for _, report in checked)
    yield (
        "summary",
        {
            "total": len(dependencies),
            "checked": len(checked),
            "failed": len(dependencies) - len(checked),
            "flagged": sum(1 for _, report in checked if report.flags),
            "elapsed_ms": elapsed_ms,
            "sequential_ms": sequential_ms,
            "speedup": round(sequential_ms / elapsed_ms, 1) if elapsed_ms else None,
            "cached_calls": sum(
                1 for _, report in checked for source in report.sources.values() if source.cached
            ),
            "fix_first": fix_first(checked),
        },
    )


def fix_first(checked: Sequence[tuple[Dependency, PackageReport]]) -> list[dict[str, Any]]:
    ranked: list[tuple[int, int, dict[str, Any]]] = []
    for dep, report in checked:
        overall = report.scores.overall
        if not report.flags and (overall is None or overall >= 80):
            continue
        vulnerable = bool(report.vulnerabilities)
        abandoned = any(flag.code in ABANDONED_FLAGS for flag in report.flags)
        base = 100 - (overall if overall is not None else 50)
        priority = round(base * (0.5 if dep.dev else 1.0) + 25 * vulnerable + 20 * abandoned)
        dependents = report.dependents.total if report.dependents else 0
        entry = {
            "ecosystem": dep.ecosystem.value,
            "name": dep.name,
            "dev": dep.dev,
            "priority": priority,
            "overall": overall,
            "band": report.scores.band.value,
            "reasons": _top_reasons(report),
        }
        ranked.append((priority, dependents, entry))
    ranked.sort(key=lambda item: (-item[0], -item[1]))
    return [entry for _, _, entry in ranked[:FIX_FIRST_LIMIT]]


def _top_reasons(report: PackageReport) -> list[str]:
    critical = [flag.message for flag in report.flags if flag.severity == "critical"]
    deductions = sorted(
        (
            reason
            for dimension in (report.scores.security, report.scores.maintenance, report.scores.supply_chain)
            for reason in dimension.reasons
            if reason.points < 0
        ),
        key=lambda reason: reason.points,
    )
    messages = critical + [reason.message for reason in deductions if reason.message not in critical]
    return list(dict.fromkeys(messages))[:2]


def _failure(index: int, dep: Dependency, code: str) -> dict[str, Any]:
    return {"index": index, "ecosystem": dep.ecosystem.value, "name": dep.name, "dev": dep.dev, "code": code}
