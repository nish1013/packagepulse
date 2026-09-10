from __future__ import annotations

import asyncio
import logging
import time
from collections.abc import AsyncIterator, Callable, Sequence
from dataclasses import dataclass
from datetime import UTC, datetime
from enum import StrEnum

from packagepulse.domain import Ecosystem, PackageContext, Provider, ProviderResult, ProviderStatus
from packagepulse.providers.base import Upstream
from packagepulse.providers.depsdev import DependentsProvider, DepsDevVersionProvider
from packagepulse.providers.github import GitHubProvider
from packagepulse.providers.osv import OSVProvider
from packagepulse.providers.scorecard import ScorecardProvider
from packagepulse.registries.npm import NpmRegistry
from packagepulse.registries.pypi import PyPIRegistry
from packagepulse.report import build_report
from packagepulse.schemas import PackageReport
from packagepulse.scoring import score_package

logger = logging.getLogger(__name__)


class Profile(StrEnum):
    FULL = "full"
    LIGHT = "light"


@dataclass(frozen=True, slots=True)
class Planned:
    sources: tuple[str, ...]


@dataclass(frozen=True, slots=True)
class ProviderStarted:
    source: str
    t_ms: int


@dataclass(frozen=True, slots=True)
class ProviderFinished:
    result: ProviderResult
    t_start_ms: int
    t_end_ms: int


@dataclass(frozen=True, slots=True)
class ReportReady:
    report: PackageReport


Event = Planned | ProviderStarted | ProviderFinished | ReportReady


class Orchestrator:
    """Runs providers as soon as the facts they need are known, and reports each one as it lands."""

    def __init__(
        self,
        upstream: Upstream,
        github_token: str | None = None,
        clock: Callable[[], float] = time.perf_counter,
        now: Callable[[], datetime] = lambda: datetime.now(UTC),
    ) -> None:
        self._upstream = upstream
        self._github = GitHubProvider(token=github_token)
        self._clock = clock
        self._now = now

    def providers(self, ecosystem: Ecosystem, profile: Profile = Profile.FULL) -> list[Provider]:
        registry: Provider = PyPIRegistry() if ecosystem is Ecosystem.PYPI else NpmRegistry()
        providers: list[Provider] = [registry, OSVProvider(), DepsDevVersionProvider()]
        if profile is Profile.FULL:
            providers += [DependentsProvider(), self._github, ScorecardProvider()]
        return providers

    async def report(
        self,
        ecosystem: Ecosystem,
        name: str,
        version: str | None = None,
        *,
        profile: Profile = Profile.FULL,
        deadline_s: float = 30.0,
    ) -> PackageReport:
        async for event in self.events(ecosystem, name, version, profile=profile, deadline_s=deadline_s):
            if isinstance(event, ReportReady):
                return event.report
        raise AssertionError("events always end with a report")  # pragma: no cover

    async def events(
        self,
        ecosystem: Ecosystem,
        name: str,
        version: str | None = None,
        *,
        profile: Profile = Profile.FULL,
        deadline_s: float = 30.0,
        providers: Sequence[Provider] | None = None,
    ) -> AsyncIterator[Event]:
        ctx = PackageContext(ecosystem, name, requested_version=version)
        pending = list(providers if providers is not None else self.providers(ecosystem, profile))
        started = self._clock()
        deadline = started + deadline_s
        results: dict[str, ProviderResult] = {}
        running: dict[asyncio.Task[ProviderResult], tuple[Provider, int]] = {}

        yield Planned(tuple(provider.name for provider in pending))
        try:
            while True:
                for provider in [p for p in pending if all(ctx.has(key) for key in p.requires)]:
                    pending.remove(provider)
                    t_start = self._ms_since(started)
                    running[asyncio.create_task(provider.run(ctx, self._upstream))] = (provider, t_start)
                    yield ProviderStarted(provider.name, t_start)

                if not running:
                    break

                done, _ = await asyncio.wait(
                    running, timeout=max(0.0, deadline - self._clock()), return_when=asyncio.FIRST_COMPLETED
                )
                if not done:
                    for task, (provider, t_start) in running.items():
                        task.cancel()
                        result = ProviderResult(provider.name, ProviderStatus.TIMEOUT, reason="deadline")
                        results[provider.name] = result
                        yield ProviderFinished(result, t_start, self._ms_since(started))
                    running.clear()
                    break

                for task in done:
                    provider, t_start = running.pop(task)
                    result = self._result_of(task, provider)
                    results[provider.name] = result
                    yield ProviderFinished(result, t_start, self._ms_since(started))

            for provider in pending:
                missing = "_".join(sorted(key for key in provider.requires if not ctx.has(key)))
                result = ProviderResult(provider.name, ProviderStatus.SKIPPED, reason=f"no_{missing}")
                results[provider.name] = result
                now_ms = self._ms_since(started)
                yield ProviderFinished(result, now_ms, now_ms)

            health = score_package(ctx, self._now())
            yield ReportReady(build_report(ctx, results, health, elapsed_ms=self._ms_since(started)))
        finally:
            for task in running:
                task.cancel()

    def _result_of(self, task: asyncio.Task[ProviderResult], provider: Provider) -> ProviderResult:
        try:
            return task.result()
        except Exception:
            logger.exception("provider %s failed", provider.name)
            return ProviderResult(provider.name, ProviderStatus.FAILED, reason="error")

    def _ms_since(self, started: float) -> int:
        return round((self._clock() - started) * 1000)
