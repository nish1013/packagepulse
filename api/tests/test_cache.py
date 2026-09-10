import asyncio

import pytest

from packagepulse.cache import MemoryTTLCache, SingleFlight


class FakeClock:
    def __init__(self) -> None:
        self.now = 1000.0

    def __call__(self) -> float:
        return self.now


async def test_returns_values_until_they_expire() -> None:
    clock = FakeClock()
    cache: MemoryTTLCache[str] = MemoryTTLCache(clock=clock)
    await cache.set("a", "value", ttl_s=10)

    hit = await cache.get("a")
    assert hit is not None
    assert hit.value == "value"

    clock.now += 10
    assert await cache.get("a") is None


async def test_can_cache_none_and_tell_it_apart_from_a_miss() -> None:
    cache: MemoryTTLCache[None] = MemoryTTLCache()
    await cache.set("empty", None, ttl_s=10)

    assert await cache.get("empty") is not None
    assert await cache.get("missing") is None


async def test_evicts_the_least_recently_used_entry() -> None:
    cache: MemoryTTLCache[int] = MemoryTTLCache(max_entries=2)
    await cache.set("a", 1, ttl_s=60)
    await cache.set("b", 2, ttl_s=60)
    await cache.get("a")
    await cache.set("c", 3, ttl_s=60)

    assert await cache.get("b") is None
    assert await cache.get("a") is not None
    assert len(cache) == 2


async def test_ignores_non_positive_ttl() -> None:
    cache: MemoryTTLCache[int] = MemoryTTLCache()
    await cache.set("a", 1, ttl_s=0)

    assert await cache.get("a") is None


async def test_single_flight_runs_one_call_for_concurrent_callers() -> None:
    flight: SingleFlight[int] = SingleFlight()
    calls = 0
    release = asyncio.Event()

    async def slow() -> int:
        nonlocal calls
        calls += 1
        await release.wait()
        return 42

    first = asyncio.create_task(flight.do("k", slow))
    second = asyncio.create_task(flight.do("k", slow))
    await asyncio.sleep(0)
    release.set()

    results = await asyncio.gather(first, second)
    assert list(results) == [42, 42]
    assert calls == 1


async def test_single_flight_shares_errors_and_then_allows_a_retry() -> None:
    flight: SingleFlight[int] = SingleFlight()

    async def broken() -> int:
        raise RuntimeError("upstream down")

    async def working() -> int:
        return 7

    with pytest.raises(RuntimeError):
        await flight.do("k", broken)
    assert await flight.do("k", working) == 7


async def test_waiters_run_the_call_themselves_if_the_owner_is_cancelled() -> None:
    flight: SingleFlight[str] = SingleFlight()
    started = asyncio.Event()

    async def never_finishes() -> str:
        started.set()
        await asyncio.Event().wait()
        return "unreachable"

    async def quick() -> str:
        return "done"

    owner = asyncio.create_task(flight.do("k", never_finishes))
    await started.wait()
    waiter = asyncio.create_task(flight.do("k", quick))
    await asyncio.sleep(0)
    owner.cancel()

    assert await waiter == "done"
