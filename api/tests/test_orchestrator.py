import asyncio
from collections.abc import Mapping, Sequence
from typing import Any

from packagepulse.domain import Ecosystem, PackageContext, Provider, ProviderResult, ProviderStatus
from packagepulse.orchestrator import (
    Event,
    Orchestrator,
    Planned,
    ProviderFinished,
    ProviderStarted,
    ReportReady,
)
from packagepulse.providers.base import Upstream


class FakeProvider:
    def __init__(
        self,
        name: str,
        requires: Sequence[str] = (),
        sets: Mapping[str, Any] | None = None,
        delay_s: float = 0.0,
        error: Exception | None = None,
    ) -> None:
        self.name = name
        self.requires = frozenset(requires)
        self._sets = sets or {}
        self._delay_s = delay_s
        self._error = error

    async def run(self, ctx: PackageContext, upstream: Upstream) -> ProviderResult:
        await asyncio.sleep(self._delay_s)
        if self._error is not None:
            raise self._error
        for key, value in self._sets.items():
            setattr(ctx, key, value)
        return ProviderResult(self.name, ProviderStatus.OK)


async def collect(upstream: Upstream, providers: Sequence[Provider], deadline_s: float = 5.0) -> list[Event]:
    orchestrator = Orchestrator(upstream)
    return [
        event
        async for event in orchestrator.events(
            Ecosystem.PYPI, "demo", providers=providers, deadline_s=deadline_s
        )
    ]


def finished(events: list[Event]) -> dict[str, ProviderResult]:
    return {e.result.source: e.result for e in events if isinstance(e, ProviderFinished)}


async def test_starts_providers_once_their_requirements_are_known(upstream: Upstream) -> None:
    events = await collect(
        upstream,
        [
            FakeProvider("registry", sets={"version": "1.0.0"}, delay_s=0.01),
            FakeProvider("osv", requires=["version"]),
        ],
    )

    order = [
        (type(e).__name__, getattr(e, "source", None) or getattr(getattr(e, "result", None), "source", None))
        for e in events
    ]
    assert order.index(("ProviderFinished", "registry")) < order.index(("ProviderStarted", "osv"))
    assert isinstance(events[0], Planned)
    assert isinstance(events[-1], ReportReady)


async def test_runs_independent_providers_concurrently(upstream: Upstream) -> None:
    events = await collect(
        upstream,
        [
            FakeProvider("registry", sets={"version": "1.0.0"}),
            FakeProvider("osv", requires=["version"], delay_s=0.05),
            FakeProvider("depsdev", requires=["version"], delay_s=0.05),
        ],
    )

    started = [e.source for e in events if isinstance(e, ProviderStarted)]
    first_slow_finish = next(
        i for i, e in enumerate(events) if isinstance(e, ProviderFinished) and e.result.source != "registry"
    )
    started_before = [e.source for e in events[:first_slow_finish] if isinstance(e, ProviderStarted)]
    assert started == ["registry", "osv", "depsdev"]
    assert {"osv", "depsdev"} <= set(started_before)


async def test_skips_providers_whose_requirements_never_arrive(upstream: Upstream) -> None:
    events = await collect(
        upstream,
        [FakeProvider("registry", sets={"version": "1.0.0"}), FakeProvider("github", requires=["repo"])],
    )

    github = finished(events)["github"]
    assert github.status is ProviderStatus.SKIPPED
    assert github.reason == "no_repo"


async def test_times_out_slow_providers_and_still_reports(upstream: Upstream) -> None:
    events = await collect(
        upstream,
        [FakeProvider("registry", sets={"version": "1.0.0"}), FakeProvider("slow", delay_s=5)],
        deadline_s=0.05,
    )

    assert finished(events)["slow"].status is ProviderStatus.TIMEOUT
    assert isinstance(events[-1], ReportReady)


async def test_turns_provider_errors_into_failed_results(upstream: Upstream) -> None:
    events = await collect(upstream, [FakeProvider("broken", error=KeyError("unexpected"))])

    assert finished(events)["broken"].status is ProviderStatus.FAILED
    assert isinstance(events[-1], ReportReady)
