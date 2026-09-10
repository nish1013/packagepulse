from __future__ import annotations

from packagepulse.domain import PackageContext, ProviderResult, ScorecardCheck, ScorecardInfo
from packagepulse.providers.base import Upstream


class ScorecardProvider:
    name = "scorecard"
    requires = frozenset({"repo"})

    async def run(self, ctx: PackageContext, upstream: Upstream) -> ProviderResult:
        url = f"https://api.securityscorecards.dev/projects/github.com/{ctx.repo}"
        response = await upstream.request("scorecard", "GET", url, ttl_s=86400)
        if response.ok and isinstance(response.data, dict) and response.data.get("score") is not None:
            ctx.scorecard = ScorecardInfo(
                score=float(response.data["score"]),
                checks=tuple(
                    ScorecardCheck(name=str(check["name"]), score=int(check["score"]))
                    for check in response.data.get("checks") or []
                    if "name" in check and "score" in check
                ),
            )
        return ProviderResult.from_response(self.name, response)
