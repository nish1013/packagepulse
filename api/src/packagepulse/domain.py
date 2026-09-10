from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum
from typing import TYPE_CHECKING, Protocol

if TYPE_CHECKING:
    from packagepulse.providers.base import Response, Upstream


class Ecosystem(StrEnum):
    PYPI = "pypi"
    NPM = "npm"

    @property
    def osv_name(self) -> str:
        return "PyPI" if self is Ecosystem.PYPI else "npm"


class ProviderStatus(StrEnum):
    OK = "ok"
    NOT_FOUND = "not_found"
    FAILED = "failed"
    TIMEOUT = "timeout"
    SKIPPED = "skipped"


@dataclass(frozen=True, slots=True)
class Vulnerability:
    id: str
    aliases: tuple[str, ...]
    summary: str | None


@dataclass(frozen=True, slots=True)
class RepositoryInfo:
    full_name: str
    url: str
    stars: int
    open_issues: int
    archived: bool
    pushed_at: datetime | None


@dataclass(frozen=True, slots=True)
class ScorecardCheck:
    name: str
    score: int


@dataclass(frozen=True, slots=True)
class ScorecardInfo:
    score: float
    checks: tuple[ScorecardCheck, ...]


@dataclass(frozen=True, slots=True)
class DependentsInfo:
    total: int
    direct: int


@dataclass
class PackageContext:
    ecosystem: Ecosystem
    name: str
    requested_version: str | None = None
    version: str | None = None
    repo: str | None = None
    published_at: datetime | None = None
    deprecated: str | None = None
    vulnerabilities: tuple[Vulnerability, ...] | None = None
    advisory_count: int | None = None
    dependents: DependentsInfo | None = None
    repository: RepositoryInfo | None = None
    repository_missing: bool = False
    scorecard: ScorecardInfo | None = None

    def has(self, key: str) -> bool:
        return getattr(self, key) is not None


@dataclass(frozen=True, slots=True)
class ProviderResult:
    source: str
    status: ProviderStatus
    http_status: int | None = None
    ms: int = 0
    cached: bool = False
    reason: str | None = None

    @classmethod
    def from_response(cls, source: str, response: Response) -> ProviderResult:
        if response.status == 200:
            status = ProviderStatus.OK
        elif response.status == 404:
            status = ProviderStatus.NOT_FOUND
        elif response.error == "timeout":
            status = ProviderStatus.TIMEOUT
        elif response.error == "circuit_open":
            return cls(source, ProviderStatus.SKIPPED, reason="provider_unavailable")
        else:
            status = ProviderStatus.FAILED
        return cls(
            source,
            status,
            http_status=response.status or None,
            ms=response.ms,
            cached=response.cached,
            reason=response.error,
        )


class Provider(Protocol):
    name: str
    requires: frozenset[str]

    async def run(self, ctx: PackageContext, upstream: Upstream) -> ProviderResult: ...


def parse_time(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
