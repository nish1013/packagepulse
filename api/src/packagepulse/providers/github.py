from __future__ import annotations

import time
from collections.abc import Callable, Mapping

from packagepulse.domain import PackageContext, ProviderResult, ProviderStatus, RepositoryInfo, parse_time
from packagepulse.providers.base import Upstream


class GitHubProvider:
    name = "github"
    requires = frozenset({"repo"})

    def __init__(
        self, token: str | None = None, quota_floor: int = 300, wall_clock: Callable[[], float] = time.time
    ) -> None:
        self._token = token
        self._quota_floor = quota_floor
        self._wall_clock = wall_clock
        self._remaining: int | None = None
        self._reset_at = 0.0

    async def run(self, ctx: PackageContext, upstream: Upstream) -> ProviderResult:
        if self._quota_low():
            return ProviderResult(self.name, ProviderStatus.SKIPPED, reason="quota_guard")

        headers = {"Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28"}
        if self._token:
            headers["Authorization"] = f"Bearer {self._token}"
        response = await upstream.request(
            "github",
            "GET",
            f"https://api.github.com/repos/{ctx.repo}",
            ttl_s=3600,
            headers=headers,
            conditional=True,
        )
        self._track_quota(response.headers)

        if response.status == 404:
            ctx.repository_missing = True
        elif response.ok and isinstance(response.data, dict):
            data = response.data
            ctx.repository = RepositoryInfo(
                full_name=str(data.get("full_name") or ctx.repo),
                url=str(data.get("html_url") or f"https://github.com/{ctx.repo}"),
                stars=int(data.get("stargazers_count") or 0),
                open_issues=int(data.get("open_issues_count") or 0),
                archived=bool(data.get("archived")),
                pushed_at=parse_time(data.get("pushed_at")),
            )
        return ProviderResult.from_response(self.name, response)

    def _quota_low(self) -> bool:
        return (
            self._remaining is not None
            and self._remaining < self._quota_floor
            and self._wall_clock() < self._reset_at
        )

    def _track_quota(self, headers: Mapping[str, str]) -> None:
        remaining = headers.get("x-ratelimit-remaining")
        reset = headers.get("x-ratelimit-reset")
        if remaining is not None and remaining.isdigit():
            self._remaining = int(remaining)
        if reset is not None and reset.isdigit():
            self._reset_at = float(reset)
