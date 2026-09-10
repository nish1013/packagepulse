from __future__ import annotations

from urllib.parse import quote

from packagepulse.domain import PackageContext, ProviderResult, parse_time
from packagepulse.providers.base import Upstream
from packagepulse.registries.repo_url import github_repo_from_urls


class PyPIRegistry:
    name = "registry"
    requires: frozenset[str] = frozenset()

    async def run(self, ctx: PackageContext, upstream: Upstream) -> ProviderResult:
        path = quote(ctx.name, safe="")
        if ctx.requested_version:
            path = f"{path}/{quote(ctx.requested_version, safe='')}"
        response = await upstream.request("registry", "GET", f"https://pypi.org/pypi/{path}/json", ttl_s=600)
        if response.ok and isinstance(response.data, dict):
            info = response.data.get("info") or {}
            ctx.version = info.get("version")
            uploads = [
                file["upload_time_iso_8601"]
                for file in response.data.get("urls") or []
                if file.get("upload_time_iso_8601")
            ]
            ctx.published_at = parse_time(max(uploads)) if uploads else None
            project_urls = info.get("project_urls") or {}
            ctx.repo = github_repo_from_urls([*project_urls.values(), info.get("home_page")])
        return ProviderResult.from_response(self.name, response)
