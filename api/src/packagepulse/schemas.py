from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel

from packagepulse.domain import Ecosystem, ProviderStatus
from packagepulse.scoring import Band, Severity


class ReasonOut(BaseModel):
    code: str
    points: int
    message: str
    source: str


class DimensionOut(BaseModel):
    score: int | None
    band: Band
    reasons: list[ReasonOut]


class ScoresOut(BaseModel):
    overall: int | None
    band: Band
    coverage: float
    security: DimensionOut
    maintenance: DimensionOut
    community: DimensionOut
    supply_chain: DimensionOut


class FlagOut(BaseModel):
    code: str
    severity: Severity
    message: str


class VulnerabilityOut(BaseModel):
    id: str
    summary: str | None
    url: str


class RepositoryOut(BaseModel):
    name: str
    url: str
    stars: int
    open_issues: int
    archived: bool
    pushed_at: datetime | None


class DependentsOut(BaseModel):
    total: int
    direct: int


class ScorecardCheckOut(BaseModel):
    name: str
    score: int


class ScorecardOut(BaseModel):
    score: float
    checks: list[ScorecardCheckOut]


class SourceOut(BaseModel):
    status: ProviderStatus
    http_status: int | None
    ms: int
    cached: bool
    reason: str | None


class TimingOut(BaseModel):
    elapsed_ms: int
    sequential_ms: int


class PackageReport(BaseModel):
    ecosystem: Ecosystem
    name: str
    version: str | None
    published_at: datetime | None
    deprecated: str | None
    repository: RepositoryOut | None
    dependents: DependentsOut | None
    vulnerabilities: list[VulnerabilityOut] | None
    scorecard: ScorecardOut | None
    scores: ScoresOut
    flags: list[FlagOut]
    sources: dict[str, SourceOut]
    timing: TimingOut
