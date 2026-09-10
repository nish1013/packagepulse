from __future__ import annotations

import asyncio
import contextlib
import json
from collections.abc import AsyncIterator, Callable, Mapping
from typing import Any

from fastapi.responses import StreamingResponse
from starlette.types import Receive, Scope, Send

SSE_HEADERS = {"Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no"}

type SseEvent = tuple[str, Mapping[str, Any]]


def format_event(name: str, data: Mapping[str, Any]) -> str:
    return f"event: {name}\ndata: {json.dumps(data, separators=(',', ':'), default=str)}\n\n"


async def with_heartbeat(events: AsyncIterator[SseEvent], ping_s: float = 15.0) -> AsyncIterator[str]:
    next_event: asyncio.Future[SseEvent] = asyncio.ensure_future(anext(events))
    try:
        while True:
            done, _ = await asyncio.wait({next_event}, timeout=ping_s)
            if not done:
                yield ": ping\n\n"
                continue
            try:
                name, data = next_event.result()
            except StopAsyncIteration:
                return
            yield format_event(name, data)
            next_event = asyncio.ensure_future(anext(events))
    finally:
        next_event.cancel()
        with contextlib.suppress(asyncio.CancelledError, StopAsyncIteration):
            await next_event


class SseResponse(StreamingResponse):
    def __init__(self, content: AsyncIterator[str], on_close: Callable[[], None] | None = None) -> None:
        super().__init__(content, media_type="text/event-stream", headers=SSE_HEADERS)
        self._on_close = on_close

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        try:
            await super().__call__(scope, receive, send)
        finally:
            if self._on_close is not None:
                self._on_close()


def sse_response(
    events: AsyncIterator[SseEvent], ping_s: float = 15.0, on_close: Callable[[], None] | None = None
) -> StreamingResponse:
    return SseResponse(with_heartbeat(events, ping_s), on_close)
