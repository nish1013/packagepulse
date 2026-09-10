from __future__ import annotations

from collections.abc import Mapping

from packagepulse.domain import PackageContext, ProviderResult
from packagepulse.schemas import (
    DependentsOut,
    DimensionOut,
    FlagOut,
    PackageReport,
    ReasonOut,
    RepositoryOut,
    ScorecardCheckOut,
    ScorecardOut,
    ScoresOut,
    SourceOut,
    TimingOut,
    VulnerabilityOut,
)
from packagepulse.scoring import DimensionScore, HealthScore


def build_report(
    ctx: PackageContext,
    results: Mapping[str, ProviderResult],
    health: HealthScore,
    elapsed_ms: int,
) -> PackageReport:
    return PackageReport(
        ecosystem=ctx.ecosystem,
        name=ctx.name,
        version=ctx.version,
        published_at=ctx.published_at,
        deprecated=ctx.deprecated,
        repository=_repository(ctx),
        dependents=DependentsOut(total=ctx.dependents.total, direct=ctx.dependents.direct)
        if ctx.dependents
        else None,
        vulnerabilities=None
        if ctx.vulnerabilities is None
        else [
            VulnerabilityOut(id=v.id, summary=v.summary, url=f"https://osv.dev/vulnerability/{v.id}")
            for v in ctx.vulnerabilities
        ],
        scorecard=ScorecardOut(
            score=ctx.scorecard.score,
            checks=[ScorecardCheckOut(name=c.name, score=c.score) for c in ctx.scorecard.checks],
        )
        if ctx.scorecard
        else None,
        scores=ScoresOut(
            overall=health.overall,
            band=health.band,
            coverage=health.coverage,
            security=_dimension(health.dimensions["security"]),
            maintenance=_dimension(health.dimensions["maintenance"]),
            community=_dimension(health.dimensions["community"]),
            supply_chain=_dimension(health.dimensions["supply_chain"]),
        ),
        flags=[FlagOut(code=f.code, severity=f.severity, message=f.message) for f in health.flags],
        sources={
            name: SourceOut(
                status=r.status, http_status=r.http_status, ms=r.ms, cached=r.cached, reason=r.reason
            )
            for name, r in results.items()
        },
        timing=TimingOut(elapsed_ms=elapsed_ms, sequential_ms=sum(r.ms for r in results.values())),
    )


def _repository(ctx: PackageContext) -> RepositoryOut | None:
    if ctx.repository is None:
        return None
    repo = ctx.repository
    return RepositoryOut(
        name=repo.full_name,
        url=repo.url,
        stars=repo.stars,
        open_issues=repo.open_issues,
        archived=repo.archived,
        pushed_at=repo.pushed_at,
    )


def _dimension(dimension: DimensionScore) -> DimensionOut:
    return DimensionOut(
        score=dimension.score,
        band=dimension.band,
        reasons=[
            ReasonOut(code=r.code, points=r.points, message=r.message, source=r.source)
            for r in dimension.reasons
        ],
    )
