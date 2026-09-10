from __future__ import annotations

from urllib.parse import quote

from packagepulse.domain import DependentsInfo, PackageContext, ProviderResult, parse_time
from packagepulse.providers.base import Upstream

DEPS_DEV = "https://api.deps.dev"


def version_path(ctx: PackageContext) -> str:
    version = ctx.version or ""
    return (
        f"systems/{ctx.ecosystem.value}/packages/{quote(ctx.name, safe='')}"
        f"/versions/{quote(version, safe='')}"
    )


class DepsDevVersionProvider:
    name = "depsdev"
    requires = frozenset({"version"})

    async def run(self, ctx: PackageContext, upstream: Upstream) -> ProviderResult:
        response = await upstream.request("depsdev", "GET", f"{DEPS_DEV}/v3/{version_path(ctx)}", ttl_s=21600)
        if response.ok and isinstance(response.data, dict):
            data = response.data
            ctx.advisory_count = len(data.get("advisoryKeys") or [])
            if ctx.published_at is None:
                ctx.published_at = parse_time(data.get("publishedAt"))
            if ctx.deprecated is None and data.get("isDeprecated"):
                ctx.deprecated = data.get("deprecatedReason") or "Deprecated by its maintainers"
            if ctx.repo is None:
                ctx.repo = _source_repo(data.get("relatedProjects") or [])
        return ProviderResult.from_response(self.name, response)


class DependentsProvider:
    name = "dependents"
    requires = frozenset({"version"})

    async def run(self, ctx: PackageContext, upstream: Upstream) -> ProviderResult:
        url = f"{DEPS_DEV}/v3alpha/{version_path(ctx)}:dependents"
        response = await upstream.request("dependents", "GET", url, ttl_s=86400)
        if response.ok and isinstance(response.data, dict):
            ctx.dependents = DependentsInfo(
                total=int(response.data.get("dependentCount") or 0),
                direct=int(response.data.get("directDependentCount") or 0),
            )
        return ProviderResult.from_response(self.name, response)


def _source_repo(related: list[dict[str, object]]) -> str | None:
    for project in related:
        key = project.get("projectKey")
        project_id = key.get("id") if isinstance(key, dict) else None
        if (
            project.get("relationType") == "SOURCE_REPO"
            and isinstance(project_id, str)
            and project_id.startswith("github.com/")
        ):
            return project_id.removeprefix("github.com/")
    return None
