from __future__ import annotations

from collections.abc import Mapping

from fastapi import Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel

PROBLEM_JSON = "application/problem+json"


class Problem(BaseModel):
    type: str = "about:blank"
    title: str
    status: int
    code: str
    detail: str | None = None


class ProblemError(Exception):
    def __init__(
        self,
        status: int,
        code: str,
        title: str,
        detail: str | None = None,
        headers: Mapping[str, str] | None = None,
    ) -> None:
        super().__init__(title)
        self.problem = Problem(title=title, status=status, code=code, detail=detail)
        self.headers = dict(headers or {})


def problem_response(problem: Problem, headers: Mapping[str, str] | None = None) -> JSONResponse:
    return JSONResponse(
        problem.model_dump(exclude_none=True),
        status_code=problem.status,
        media_type=PROBLEM_JSON,
        headers=dict(headers or {}),
    )


async def handle_problem(_: Request, exc: Exception) -> JSONResponse:
    if not isinstance(exc, ProblemError):
        raise exc
    return problem_response(exc.problem, exc.headers)


async def handle_validation(_: Request, exc: Exception) -> JSONResponse:
    if not isinstance(exc, RequestValidationError):
        raise exc
    first = exc.errors()[0] if exc.errors() else {}
    location = ".".join(str(part) for part in first.get("loc", ()))
    detail = f"{location}: {first.get('msg')}" if first else None
    return problem_response(
        Problem(title="Invalid request", status=422, code="invalid_request", detail=detail)
    )
