from __future__ import annotations

import json
from collections.abc import Iterable

from starlette.types import ASGIApp, Message, Receive, Scope, Send

from packagepulse.errors import PROBLEM_JSON
from packagepulse.security.signature import SignatureError, Verifier

MAX_BODY_BYTES = 256_000


class SignatureMiddleware:
    def __init__(
        self,
        app: ASGIApp,
        verifier: Verifier | None,
        exempt_paths: Iterable[str] = ("/health",),
        max_body_bytes: int = MAX_BODY_BYTES,
    ) -> None:
        self._app = app
        self._verifier = verifier
        self._exempt_paths = frozenset(exempt_paths)
        self._max_body_bytes = max_body_bytes

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or scope["path"] in self._exempt_paths:
            await self._app(scope, receive, send)
            return

        headers = {
            name.decode("latin-1").lower(): value.decode("latin-1") for name, value in scope["headers"]
        }
        declared = headers.get("content-length", "")
        if declared.isdigit() and int(declared) > self._max_body_bytes:
            await _reject(send, 413, "request_too_large", "Request too large")
            return
        body = await _read_body(receive, self._max_body_bytes)
        if body is None:
            await _reject(send, 413, "request_too_large", "Request too large")
            return

        if self._verifier is None:
            client = scope.get("client")
            client_ip = client[0] if client else "unknown"
        else:
            raw_path: bytes = scope.get("raw_path") or scope["path"].encode()
            try:
                client_ip = self._verifier.verify(
                    headers,
                    scope["method"],
                    raw_path.split(b"?", 1)[0].decode("latin-1"),
                    scope.get("query_string", b"").decode("latin-1"),
                    body,
                )
            except SignatureError as exc:
                await _reject(send, 401, exc.code, "Unauthorized", exc.message)
                return

        scope.setdefault("state", {})["client_ip"] = client_ip
        await self._app(scope, _replay(body, receive), send)


async def _read_body(receive: Receive, limit: int) -> bytes | None:
    chunks: list[bytes] = []
    size = 0
    more_body = True
    while more_body:
        message = await receive()
        if message["type"] != "http.request":
            break
        chunk: bytes = message.get("body", b"")
        size += len(chunk)
        if size > limit:
            return None
        chunks.append(chunk)
        more_body = bool(message.get("more_body", False))
    return b"".join(chunks)


def _replay(body: bytes, receive: Receive) -> Receive:
    replayed = False

    async def replay() -> Message:
        nonlocal replayed
        if not replayed:
            replayed = True
            return {"type": "http.request", "body": body, "more_body": False}
        return await receive()

    return replay


async def _reject(send: Send, status: int, code: str, title: str, detail: str | None = None) -> None:
    problem: dict[str, object] = {"type": "about:blank", "title": title, "status": status, "code": code}
    if detail:
        problem["detail"] = detail
    body = json.dumps(problem).encode()
    await send(
        {
            "type": "http.response.start",
            "status": status,
            "headers": [
                (b"content-type", PROBLEM_JSON.encode()),
                (b"content-length", str(len(body)).encode()),
            ],
        }
    )
    await send({"type": "http.response.body", "body": body})
