from collections.abc import Callable
from datetime import UTC, datetime
from typing import Any

import httpx
import respx

from packagepulse.domain import Ecosystem, PackageContext, ProviderStatus, Vulnerability
from packagepulse.providers.base import Upstream
from packagepulse.providers.depsdev import DependentsProvider, DepsDevVersionProvider
from packagepulse.providers.github import GitHubProvider
from packagepulse.providers.osv import OSVProvider, distinct
from packagepulse.providers.scorecard import ScorecardProvider
from packagepulse.registries.npm import NpmRegistry
from packagepulse.registries.pypi import PyPIRegistry

Fixture = Callable[[str], Any]


@respx.mock
async def test_pypi_registry_reads_version_release_and_repository(
    upstream: Upstream, fixture: Fixture
) -> None:
    respx.get("https://pypi.org/pypi/fastapi/json").mock(
        return_value=httpx.Response(200, json=fixture("pypi_fastapi.json"))
    )
    ctx = PackageContext(Ecosystem.PYPI, "fastapi")

    result = await PyPIRegistry().run(ctx, upstream)

    assert result.status is ProviderStatus.OK
    assert ctx.version == "0.141.1"
    assert ctx.repo == "fastapi/fastapi"
    assert ctx.published_at == datetime(2026, 7, 29, 17, 18, 4, 364385, tzinfo=UTC)


@respx.mock
async def test_pypi_registry_requests_a_specific_version(upstream: Upstream, fixture: Fixture) -> None:
    route = respx.get("https://pypi.org/pypi/fastapi/0.100.0/json").mock(
        return_value=httpx.Response(200, json=fixture("pypi_fastapi.json"))
    )

    await PyPIRegistry().run(PackageContext(Ecosystem.PYPI, "fastapi", requested_version="0.100.0"), upstream)

    assert route.called


@respx.mock
async def test_registry_reports_unknown_packages(upstream: Upstream) -> None:
    respx.get("https://pypi.org/pypi/not-a-real-package/json").mock(return_value=httpx.Response(404))
    ctx = PackageContext(Ecosystem.PYPI, "not-a-real-package")

    result = await PyPIRegistry().run(ctx, upstream)

    assert result.status is ProviderStatus.NOT_FOUND
    assert ctx.version is None


@respx.mock
async def test_npm_registry_reads_deprecation_and_repository(upstream: Upstream, fixture: Fixture) -> None:
    respx.get("https://registry.npmjs.org/left-pad/latest").mock(
        return_value=httpx.Response(200, json=fixture("npm_left_pad.json"))
    )
    ctx = PackageContext(Ecosystem.NPM, "left-pad")

    await NpmRegistry().run(ctx, upstream)

    assert ctx.version == "1.3.0"
    assert ctx.deprecated == "use String.prototype.padStart()"
    assert ctx.repo == "stevemao/left-pad"


@respx.mock
async def test_npm_registry_encodes_scoped_names(upstream: Upstream, fixture: Fixture) -> None:
    route = respx.get("https://registry.npmjs.org/@types%2Fnode/latest").mock(
        return_value=httpx.Response(200, json=fixture("npm_types_node.json"))
    )
    ctx = PackageContext(Ecosystem.NPM, "@types/node")

    await NpmRegistry().run(ctx, upstream)

    assert route.called
    assert ctx.repo == "DefinitelyTyped/DefinitelyTyped"


@respx.mock
async def test_osv_counts_each_vulnerability_once(upstream: Upstream, fixture: Fixture) -> None:
    respx.post("https://api.osv.dev/v1/query").mock(
        return_value=httpx.Response(200, json=fixture("osv_pycrypto.json"))
    )
    ctx = PackageContext(Ecosystem.PYPI, "pycrypto", version="2.6.1")

    await OSVProvider().run(ctx, upstream)

    assert ctx.vulnerabilities is not None
    assert sorted(v.id for v in ctx.vulnerabilities) == ["GHSA-6528-wvf6-f6qg", "GHSA-cq27-v7xp-c356"]


@respx.mock
async def test_osv_reports_no_vulnerabilities_as_an_empty_tuple(upstream: Upstream) -> None:
    respx.post("https://api.osv.dev/v1/query").mock(return_value=httpx.Response(200, json={}))
    ctx = PackageContext(Ecosystem.PYPI, "fastapi", version="0.141.1")

    await OSVProvider().run(ctx, upstream)

    assert ctx.vulnerabilities == ()


def test_distinct_merges_alias_chains() -> None:
    records = [
        Vulnerability("A", ("CVE-1",), None),
        Vulnerability("B", ("CVE-2",), "second"),
        Vulnerability("C", ("CVE-1", "CVE-2"), None),
    ]

    assert len(distinct(records)) == 1


@respx.mock
async def test_depsdev_fills_release_date_and_repository(upstream: Upstream, fixture: Fixture) -> None:
    respx.get("https://api.deps.dev/v3/systems/npm/packages/express/versions/5.2.1").mock(
        return_value=httpx.Response(200, json=fixture("depsdev_version_express.json"))
    )
    ctx = PackageContext(Ecosystem.NPM, "express", version="5.2.1")

    await DepsDevVersionProvider().run(ctx, upstream)

    assert ctx.advisory_count == 0
    assert ctx.published_at == datetime(2025, 12, 1, 20, 49, 43, tzinfo=UTC)
    assert ctx.repo == "expressjs/express"


@respx.mock
async def test_dependents_counts(upstream: Upstream, fixture: Fixture) -> None:
    respx.get("https://api.deps.dev/v3alpha/systems/npm/packages/express/versions/5.2.1:dependents").mock(
        return_value=httpx.Response(200, json=fixture("depsdev_dependents_express.json"))
    )
    ctx = PackageContext(Ecosystem.NPM, "express", version="5.2.1")

    await DependentsProvider().run(ctx, upstream)

    assert ctx.dependents is not None
    assert ctx.dependents.total == 95100
    assert ctx.dependents.direct == 16140


@respx.mock
async def test_github_reads_repository_state(upstream: Upstream, fixture: Fixture) -> None:
    route = respx.get("https://api.github.com/repos/stevemao/left-pad").mock(
        return_value=httpx.Response(200, json=fixture("github_left_pad.json"))
    )
    ctx = PackageContext(Ecosystem.NPM, "left-pad", repo="stevemao/left-pad")

    await GitHubProvider(token="test-token").run(ctx, upstream)

    assert route.calls[0].request.headers["Authorization"] == "Bearer test-token"
    assert ctx.repository is not None
    assert ctx.repository.archived
    assert ctx.repository.stars == 1303


@respx.mock
async def test_github_marks_missing_repositories(upstream: Upstream) -> None:
    respx.get("https://api.github.com/repos/gone/away").mock(return_value=httpx.Response(404))
    ctx = PackageContext(Ecosystem.PYPI, "orphan", repo="gone/away")

    result = await GitHubProvider().run(ctx, upstream)

    assert result.status is ProviderStatus.NOT_FOUND
    assert ctx.repository_missing


@respx.mock
async def test_github_skips_when_quota_is_nearly_used(upstream: Upstream, fixture: Fixture) -> None:
    route = respx.get("https://api.github.com/repos/expressjs/express").mock(
        return_value=httpx.Response(
            200,
            json=fixture("github_express.json"),
            headers={"x-ratelimit-remaining": "12", "x-ratelimit-reset": "4000000000"},
        )
    )
    provider = GitHubProvider(wall_clock=lambda: 1000.0)

    await provider.run(PackageContext(Ecosystem.NPM, "express", repo="expressjs/express"), upstream)
    skipped = await provider.run(PackageContext(Ecosystem.NPM, "express", repo="expressjs/express"), upstream)

    assert skipped.status is ProviderStatus.SKIPPED
    assert skipped.reason == "quota_guard"
    assert route.call_count == 1


@respx.mock
async def test_scorecard_reads_score_and_checks(upstream: Upstream, fixture: Fixture) -> None:
    respx.get("https://api.securityscorecards.dev/projects/github.com/expressjs/express").mock(
        return_value=httpx.Response(200, json=fixture("scorecard_express.json"))
    )
    ctx = PackageContext(Ecosystem.NPM, "express", repo="expressjs/express")

    await ScorecardProvider().run(ctx, upstream)

    assert ctx.scorecard is not None
    assert ctx.scorecard.score == 8.9
    assert len(ctx.scorecard.checks) == 18


@respx.mock
async def test_timeouts_become_timeout_results(upstream: Upstream) -> None:
    respx.get("https://api.securityscorecards.dev/projects/github.com/slow/repo").mock(
        side_effect=httpx.ConnectTimeout("slow")
    )

    result = await ScorecardProvider().run(PackageContext(Ecosystem.NPM, "x", repo="slow/repo"), upstream)

    assert result.status is ProviderStatus.TIMEOUT
