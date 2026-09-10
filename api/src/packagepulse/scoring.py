from __future__ import annotations

import math
from collections.abc import Mapping
from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum

from packagepulse.domain import PackageContext

STALE_RELEASE_DAYS = 548
AGING_RELEASE_DAYS = 365
INACTIVE_PUSH_DAYS = 365
QUIET_PUSH_DAYS = 180
LOW_SCORECARD = 4.0
FAIR_SCORECARD = 6.0

WEIGHTS: Mapping[str, int] = {"security": 35, "maintenance": 30, "community": 15, "supply_chain": 20}
SUPPLY_CHAIN_CHECKS: Mapping[str, int] = {
    "Dangerous-Workflow": 25,
    "Binary-Artifacts": 10,
    "Token-Permissions": 8,
    "Code-Review": 8,
    "Security-Policy": 5,
}


class Band(StrEnum):
    HEALTHY = "healthy"
    WATCH = "watch"
    AT_RISK = "at_risk"
    UNKNOWN = "unknown"


class Severity(StrEnum):
    CRITICAL = "critical"
    WARNING = "warning"


@dataclass(frozen=True, slots=True)
class Reason:
    code: str
    points: int
    message: str
    source: str


@dataclass(frozen=True, slots=True)
class DimensionScore:
    score: int | None
    reasons: tuple[Reason, ...] = ()

    @property
    def band(self) -> Band:
        return band_for(self.score)


@dataclass(frozen=True, slots=True)
class Flag:
    code: str
    severity: Severity
    message: str


@dataclass(frozen=True, slots=True)
class HealthScore:
    overall: int | None
    band: Band
    coverage: float
    dimensions: Mapping[str, DimensionScore]
    flags: tuple[Flag, ...]


def band_for(score: int | None, coverage: float = 1.0) -> Band:
    if score is None or coverage < 0.5:
        return Band.UNKNOWN
    if score >= 80:
        return Band.HEALTHY
    if score >= 60:
        return Band.WATCH
    return Band.AT_RISK


def score_package(ctx: PackageContext, now: datetime) -> HealthScore:
    dimensions = {
        "security": _security(ctx),
        "maintenance": _maintenance(ctx, now),
        "community": _community(ctx),
        "supply_chain": _supply_chain(ctx),
    }
    scored = {name: dim.score for name, dim in dimensions.items() if dim.score is not None}
    weight = sum(WEIGHTS[name] for name in scored)
    coverage = weight / sum(WEIGHTS.values())

    overall = None
    if weight:
        overall = round(sum(score * WEIGHTS[name] for name, score in scored.items()) / weight)
        if ctx.deprecated or _archived(ctx):
            overall = min(overall, 30)
        if ctx.vulnerabilities:
            overall = min(overall, 60)

    return HealthScore(
        overall=overall,
        band=band_for(overall, coverage),
        coverage=round(coverage, 2),
        dimensions=dimensions,
        flags=_flags(ctx, now),
    )


def _security(ctx: PackageContext) -> DimensionScore:
    if ctx.vulnerabilities is None and ctx.scorecard is None:
        return DimensionScore(None)
    reasons = []
    if ctx.vulnerabilities:
        count = len(ctx.vulnerabilities)
        noun = "vulnerability" if count == 1 else "vulnerabilities"
        points = -min(100, 40 + 15 * (count - 1))
        reasons.append(
            Reason("known_vulnerabilities", points, f"{count} known {noun} in this version", "osv")
        )
    if ctx.scorecard is not None and ctx.scorecard.score < FAIR_SCORECARD:
        points = -25 if ctx.scorecard.score < LOW_SCORECARD else -10
        message = f"OpenSSF Scorecard {ctx.scorecard.score:.1f}/10"
        reasons.append(Reason("scorecard", points, message, "scorecard"))
    return _deduct(reasons)


def _maintenance(ctx: PackageContext, now: datetime) -> DimensionScore:
    if ctx.published_at is None and ctx.repository is None and not ctx.deprecated:
        return DimensionScore(None)

    if ctx.deprecated or _archived(ctx):
        reasons = []
        if ctx.deprecated:
            reasons.append(Reason("deprecated", -90, f"Deprecated: {ctx.deprecated}", "registry"))
        if _archived(ctx):
            points = 0 if reasons else -90
            reasons.append(Reason("archived", points, "Repository is archived", "github"))
        return DimensionScore(10, tuple(reasons))

    reasons = []
    if ctx.published_at is not None:
        days = (now - ctx.published_at).days
        if days > STALE_RELEASE_DAYS:
            reasons.append(Reason("stale_release", -35, f"No release for {days} days", "registry"))
        elif days > AGING_RELEASE_DAYS:
            reasons.append(Reason("aging_release", -15, f"No release for {days} days", "registry"))
    if ctx.repository is not None and ctx.repository.pushed_at is not None:
        days = (now - ctx.repository.pushed_at).days
        if days > INACTIVE_PUSH_DAYS:
            reasons.append(Reason("inactive_repository", -30, f"No code pushed for {days} days", "github"))
        elif days > QUIET_PUSH_DAYS:
            reasons.append(Reason("quiet_repository", -10, f"No code pushed for {days} days", "github"))
    return _deduct(reasons)


def _community(ctx: PackageContext) -> DimensionScore:
    reasons = []
    earned = 0
    possible = 0
    if ctx.repository is not None:
        stars = ctx.repository.stars
        points = round(min(60, 12 * math.log10(stars + 1)))
        reasons.append(Reason("stars", points, f"{stars:,} GitHub stars", "github"))
        earned += points
        possible += 60
    if ctx.dependents is not None:
        total = ctx.dependents.total
        points = round(min(40, 8 * math.log10(total + 1)))
        reasons.append(Reason("dependents", points, f"{total:,} dependent packages", "dependents"))
        earned += points
        possible += 40
    if not possible:
        return DimensionScore(None)
    return DimensionScore(round(earned / possible * 100), tuple(reasons))


def _supply_chain(ctx: PackageContext) -> DimensionScore:
    if ctx.version is None:
        return DimensionScore(None)
    reasons = []
    if ctx.repository_missing:
        message = f"Linked repository {ctx.repo} no longer exists"
        reasons.append(Reason("repository_missing", -50, message, "github"))
    elif ctx.repo is None:
        reasons.append(Reason("no_repository", -30, "No source repository linked", "registry"))
    if ctx.scorecard is not None:
        for check in ctx.scorecard.checks:
            penalty = SUPPLY_CHAIN_CHECKS.get(check.name)
            if penalty is not None and 0 <= check.score < 5:
                code = "scorecard_" + check.name.lower().replace("-", "_")
                message = f"Scorecard check {check.name}: {check.score}/10"
                reasons.append(Reason(code, -penalty, message, "scorecard"))
    return _deduct(reasons)


def _flags(ctx: PackageContext, now: datetime) -> tuple[Flag, ...]:
    flags = []
    if ctx.vulnerabilities:
        count = len(ctx.vulnerabilities)
        noun = "vulnerability" if count == 1 else "vulnerabilities"
        flags.append(Flag("vulnerable", Severity.CRITICAL, f"{count} known {noun} in {ctx.version}"))
    if ctx.deprecated:
        flags.append(Flag("deprecated", Severity.CRITICAL, f"Deprecated: {ctx.deprecated}"))
    if _archived(ctx):
        flags.append(Flag("archived", Severity.CRITICAL, "Repository is archived"))
    if ctx.repository_missing:
        flags.append(Flag("repository_missing", Severity.CRITICAL, "Linked repository no longer exists"))
    if ctx.published_at is not None and (days := (now - ctx.published_at).days) > STALE_RELEASE_DAYS:
        flags.append(Flag("stale_release", Severity.WARNING, f"No release for {days} days"))
    if (
        ctx.repository is not None
        and not ctx.repository.archived
        and ctx.repository.pushed_at is not None
        and (days := (now - ctx.repository.pushed_at).days) > INACTIVE_PUSH_DAYS
    ):
        flags.append(Flag("inactive_repository", Severity.WARNING, f"No code pushed for {days} days"))
    if ctx.scorecard is not None and ctx.scorecard.score < LOW_SCORECARD:
        flags.append(
            Flag("low_scorecard", Severity.WARNING, f"OpenSSF Scorecard {ctx.scorecard.score:.1f}/10")
        )
    return tuple(flags)


def _archived(ctx: PackageContext) -> bool:
    return ctx.repository is not None and ctx.repository.archived


def _deduct(reasons: list[Reason]) -> DimensionScore:
    return DimensionScore(max(0, 100 + sum(reason.points for reason in reasons)), tuple(reasons))
