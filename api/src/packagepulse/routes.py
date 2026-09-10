from __future__ import annotations

import logging
import re
import uuid
from collections.abc import AsyncIterator
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import JSONResponse, Response

from packagepulse.domain import Ecosystem, ProviderStatus
from packagepulse.errors import ProblemError
from packagepulse.orchestrator import Orchestrator, Planned, ProviderFinished, ProviderStarted, ReportReady
from packagepulse.schemas import PackageReport
from packagepulse.sse import SseEvent, sse_response

logger = logging.getLogger(__name__)

NPM_NAME = re.compile(r"(?:@[a-z0-9][a-z0-9._~-]*/)?[a-z0-9][a-z0-9._~-]*", re.IGNORECASE)
PYPI_NAME = re.compile(r"[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?", re.IGNORECASE)
MAX_NAME_LENGTH = 214
PACKAGE_DEADLINE_S = 30.0

router = APIRouter(prefix="/v1", tags=["packages"])


def get_orchestrator(request: Request) -> Orchestrator:
    orchestrator: Orchestrator = request.app.state.orchestrator
    return orchestrator


OrchestratorDep = Annotated[Orchestrator, Depends(get_orchestrator)]
VersionQuery = Annotated[str | None, Query(max_length=64)]


@router.get("/packages/{ecosystem}/{name:path}/stream", response_model=None)
async def package_stream(
    ecosystem: Ecosystem, name: str, orchestrator: OrchestratorDep, version: VersionQuery = None
) -> Response:
    if is_bare_scope(ecosystem, name):
        report = await report_or_problem(orchestrator, ecosystem, f"{name}/stream", version)
        return JSONResponse(report.model_dump(mode="json"))
    return sse_response(_package_events(orchestrator, ecosystem, validate_name(ecosystem, name), version))


@router.get("/packages/{ecosystem}/{name:path}")
async def package(
    ecosystem: Ecosystem, name: str, orchestrator: OrchestratorDep, version: VersionQuery = None
) -> PackageReport:
    return await report_or_problem(orchestrator, ecosystem, validate_name(ecosystem, name), version)


def validate_name(ecosystem: Ecosystem, name: str) -> str:
    pattern = NPM_NAME if ecosystem is Ecosystem.NPM else PYPI_NAME
    if len(name) > MAX_NAME_LENGTH or not pattern.fullmatch(name):
        raise ProblemError(
            422,
            "invalid_name",
            "Invalid package name",
            f"'{name}' is not a valid {ecosystem.value} package name",
        )
    return name


def is_bare_scope(ecosystem: Ecosystem, name: str) -> bool:
    return ecosystem is Ecosystem.NPM and name.startswith("@") and "/" not in name


async def report_or_problem(
    orchestrator: Orchestrator, ecosystem: Ecosystem, name: str, version: str | None
) -> PackageReport:
    report = await orchestrator.report(ecosystem, name, version, deadline_s=PACKAGE_DEADLINE_S)
    if report.version is None:
        raise _missing_package(report, ecosystem, name)
    return report


def _missing_package(report: PackageReport, ecosystem: Ecosystem, name: str) -> ProblemError:
    registry = report.sources.get("registry")
    if registry is not None and registry.status is ProviderStatus.NOT_FOUND:
        return ProblemError(
            404, "not_found", "Package not found", f"{name} was not found on {ecosystem.value}"
        )
    return ProblemError(
        502, "registry_unavailable", "Registry unavailable", f"The {ecosystem.value} registry didn't respond"
    )


async def _package_events(
    orchestrator: Orchestrator, ecosystem: Ecosystem, name: str, version: str | None
) -> AsyncIterator[SseEvent]:
    request_id = uuid.uuid4().hex
    try:
        async for event in orchestrator.events(ecosystem, name, version, deadline_s=PACKAGE_DEADLINE_S):
            match event:
                case Planned(sources=sources):
                    yield (
                        "start",
                        {
                            "request_id": request_id,
                            "ecosystem": ecosystem.value,
                            "name": name,
                            "version": version,
                            "planned": list(sources),
                        },
                    )
                case ProviderStarted(source=source, t_ms=t_ms):
                    yield "provider_start", {"source": source, "t_ms": t_ms}
                case ProviderFinished(result=result, t_start_ms=t_start, t_end_ms=t_end):
                    yield (
                        "provider",
                        {
                            "source": result.source,
                            "status": result.status.value,
                            "http_status": result.http_status,
                            "reason": result.reason,
                            "cached": result.cached,
                            "t_start_ms": t_start,
                            "t_end_ms": t_end,
                        },
                    )
                case ReportReady(report=report) if report.version is None:
                    problem = _missing_package(report, ecosystem, name).problem
                    yield "error", {"code": problem.code, "message": problem.detail}
                case ReportReady(report=report):
                    yield "report", report.model_dump(mode="json")
    except Exception:
        logger.exception("stream for %s/%s failed", ecosystem.value, name)
        yield "error", {"code": "internal_error", "message": "Something went wrong while building the report"}
