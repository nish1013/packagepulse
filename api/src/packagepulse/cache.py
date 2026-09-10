from __future__ import annotations

import asyncio
import time
from collections import OrderedDict
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Protocol


@dataclass(frozen=True, slots=True)
class Hit[V]:
    value: V


class Cache[V](Protocol):
    async def get(self, key: str) -> Hit[V] | None: ...

    async def set(self, key: str, value: V, ttl_s: float) -> None: ...


class MemoryTTLCache[V]:
    """LRU cache with a TTL per entry."""

    def __init__(self, max_entries: int = 5000, clock: Callable[[], float] = time.monotonic) -> None:
        self._entries: OrderedDict[str, tuple[float, V]] = OrderedDict()
        self._max_entries = max_entries
        self._clock = clock

    async def get(self, key: str) -> Hit[V] | None:
        entry = self._entries.get(key)
        if entry is None:
            return None
        expires_at, value = entry
        if expires_at <= self._clock():
            del self._entries[key]
            return None
        self._entries.move_to_end(key)
        return Hit(value)

    async def set(self, key: str, value: V, ttl_s: float) -> None:
        if ttl_s <= 0:
            return
        self._entries[key] = (self._clock() + ttl_s, value)
        self._entries.move_to_end(key)
        while len(self._entries) > self._max_entries:
            self._entries.popitem(last=False)

    def __len__(self) -> int:
        return len(self._entries)


class SingleFlight[T]:
    """Runs one call per key at a time and shares its result with concurrent callers."""

    def __init__(self) -> None:
        self._inflight: dict[str, asyncio.Future[T]] = {}

    async def do(self, key: str, fn: Callable[[], Awaitable[T]]) -> T:
        while (existing := self._inflight.get(key)) is not None:
            try:
                return await asyncio.shield(existing)
            except asyncio.CancelledError:
                task = asyncio.current_task()
                if task is not None and task.cancelling():
                    raise

        future: asyncio.Future[T] = asyncio.get_running_loop().create_future()
        future.add_done_callback(lambda f: None if f.cancelled() else f.exception())
        self._inflight[key] = future
        try:
            result = await fn()
        except asyncio.CancelledError:
            future.cancel()
            raise
        except BaseException as exc:
            future.set_exception(exc)
            raise
        else:
            future.set_result(result)
            return result
        finally:
            del self._inflight[key]
