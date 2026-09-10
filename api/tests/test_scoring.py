from datetime import UTC, datetime, timedelta

from packagepulse.domain import (
    DependentsInfo,
    Ecosystem,
    PackageContext,
    RepositoryInfo,
    ScorecardCheck,
    ScorecardInfo,
    Vulnerability,
)
from packagepulse.scoring import Band, score_package

NOW = datetime(2026, 9, 10, tzinfo=UTC)


def days_ago(days: int) -> datetime:
    return NOW - timedelta(days=days)


def repository(stars: int, pushed_days_ago: int, archived: bool = False) -> RepositoryInfo:
    return RepositoryInfo(
        full_name="owner/repo",
        url="https://github.com/owner/repo",
        stars=stars,
        open_issues=0,
        archived=archived,
        pushed_at=days_ago(pushed_days_ago),
    )


def fastapi_like() -> PackageContext:
    return PackageContext(
        Ecosystem.PYPI,
        "fastapi",
        version="0.141.1",
        repo="fastapi/fastapi",
        published_at=days_ago(42),
        vulnerabilities=(),
        dependents=DependentsInfo(total=20017, direct=14066),
        repository=repository(stars=102232, pushed_days_ago=8),
    )


def test_a_maintained_popular_package_is_healthy() -> None:
    health = score_package(fastapi_like(), NOW)

    assert health.band is Band.HEALTHY
    assert health.overall is not None
    assert health.overall >= 90
    assert health.coverage == 1.0
    assert health.flags == ()


def test_a_deprecated_archived_package_is_at_risk() -> None:
    ctx = PackageContext(
        Ecosystem.NPM,
        "left-pad",
        version="1.3.0",
        repo="stevemao/left-pad",
        deprecated="use String.prototype.padStart()",
        published_at=days_ago(3076),
        vulnerabilities=(),
        repository=repository(stars=1303, pushed_days_ago=2701, archived=True),
        scorecard=ScorecardInfo(score=3.9, checks=()),
    )

    health = score_package(ctx, NOW)

    assert health.overall is not None
    assert health.overall <= 30
    assert health.band is Band.AT_RISK
    assert {flag.code for flag in health.flags} == {
        "deprecated",
        "archived",
        "stale_release",
        "low_scorecard",
    }


def test_vulnerabilities_cap_the_overall_score() -> None:
    ctx = fastapi_like()
    ctx.vulnerabilities = (Vulnerability("GHSA-1", (), "Remote code execution"),)

    health = score_package(ctx, NOW)

    assert health.overall == 60
    assert health.flags[0].code == "vulnerable"


def test_an_old_vulnerable_package_without_a_repository() -> None:
    ctx = PackageContext(
        Ecosystem.PYPI,
        "pycrypto",
        version="2.6.1",
        published_at=days_ago(4465),
        vulnerabilities=(
            Vulnerability("GHSA-6528-wvf6-f6qg", (), "Pycrypto generates weak key parameters"),
            Vulnerability("GHSA-cq27-v7xp-c356", (), "Buffer Overflow in pycrypto"),
        ),
    )

    health = score_package(ctx, NOW)

    assert health.dimensions["security"].score == 45
    assert health.dimensions["supply_chain"].score == 70
    assert health.dimensions["community"].score is None
    assert health.coverage == 0.85
    assert health.band is Band.AT_RISK


def test_too_little_evidence_is_unknown() -> None:
    health = score_package(PackageContext(Ecosystem.NPM, "tiny", version="1.0.0", repo="a/b"), NOW)

    assert health.band is Band.UNKNOWN
    assert health.coverage == 0.2


def test_dangerous_workflows_reduce_supply_chain() -> None:
    ctx = fastapi_like()
    ctx.scorecard = ScorecardInfo(
        score=7.0,
        checks=(ScorecardCheck("Dangerous-Workflow", 0), ScorecardCheck("Fuzzing", 0)),
    )

    supply_chain = score_package(ctx, NOW).dimensions["supply_chain"]

    assert supply_chain.score == 75
    assert [reason.code for reason in supply_chain.reasons] == ["scorecard_dangerous_workflow"]


def test_deductions_add_up_to_each_score() -> None:
    ctx = fastapi_like()
    ctx.published_at = days_ago(400)
    ctx.repository = repository(stars=50, pushed_days_ago=200)
    ctx.scorecard = ScorecardInfo(score=5.0, checks=(ScorecardCheck("Code-Review", 2),))

    health = score_package(ctx, NOW)

    for name in ("security", "maintenance", "supply_chain"):
        dimension = health.dimensions[name]
        assert dimension.score == max(0, 100 + sum(reason.points for reason in dimension.reasons))
