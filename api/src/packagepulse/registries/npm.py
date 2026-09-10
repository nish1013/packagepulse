from __future__ import annotations

from urllib.parse import quote

from packagepulse.domain import PackageContext, ProviderResult
from packagepulse.providers.base import Upstream
from packagepulse.registries.repo_url import github_repo_from_npm


class NpmRegistry:
    name = "registry"
    requires: frozenset[str] = frozenset()

    async def run(self, ctx: PackageContext, upstream: Upstream) -> ProviderResult:
        version = quote(ctx.requested_version or "latest", safe="")
        url = f"https://registry.npmjs.org/{quote(ctx.name, safe='@')}/{version}"
        response = await upstream.request("registry", "GET", url, ttl_s=600)
        if response.ok and isinstance(response.data, dict):
            data = response.data
            ctx.version = data.get("version")
            if deprecated := data.get("deprecated"):
                ctx.deprecated = str(deprecated)
            ctx.repo = github_repo_from_npm(data.get("repository"), data.get("homepage"))
        return ProviderResult.from_response(self.name, response)
