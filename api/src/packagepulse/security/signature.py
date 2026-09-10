from __future__ import annotations

import argparse
import hashlib
import hmac
import ipaddress
import os
import secrets
import sys
import time
from collections import OrderedDict
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass
from urllib.parse import parse_qsl, quote, unquote

SCHEME = "PP1"
TIMESTAMP_HEADER = "x-pp-timestamp"
NONCE_HEADER = "x-pp-nonce"
CLIENT_IP_HEADER = "x-pp-client-ip"
SIGNATURE_HEADER = "x-pp-signature"
MAX_SKEW_S = 60
NONCE_TTL_S = 120
MAX_NONCE_LENGTH = 64


@dataclass(frozen=True, slots=True)
class SignedRequest:
    timestamp: str
    nonce: str
    method: str
    path: str
    query: str
    client_ip: str
    body: bytes = b""

    def canonical(self) -> str:
        return "\n".join(
            (
                SCHEME,
                self.timestamp,
                self.nonce,
                self.method.upper(),
                unquote(self.path),
                canonical_query(self.query),
                self.client_ip,
                hashlib.sha256(self.body).hexdigest(),
            )
        )


def canonical_query(query: str) -> str:
    pairs = sorted(parse_qsl(query, keep_blank_values=True))
    return "&".join(f"{quote(key, safe='')}={quote(value, safe='')}" for key, value in pairs)


def sign(secret: str, request: SignedRequest) -> str:
    digest = hmac.new(secret.encode(), request.canonical().encode(), hashlib.sha256).hexdigest()
    return f"v1={digest}"


def signed_headers(
    secret: str,
    method: str,
    path: str,
    query: str = "",
    client_ip: str = "203.0.113.10",
    body: bytes = b"",
    timestamp: int | None = None,
) -> dict[str, str]:
    stamp = str(int(time.time()) if timestamp is None else timestamp)
    nonce = secrets.token_urlsafe(16)
    request = SignedRequest(stamp, nonce, method, path, query, client_ip, body)
    return {
        TIMESTAMP_HEADER: stamp,
        NONCE_HEADER: nonce,
        CLIENT_IP_HEADER: client_ip,
        SIGNATURE_HEADER: sign(secret, request),
    }


class SignatureError(Exception):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


class NonceStore:
    def __init__(
        self,
        ttl_s: float = NONCE_TTL_S,
        max_entries: int = 100_000,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self._entries: OrderedDict[str, float] = OrderedDict()
        self._ttl_s = ttl_s
        self._max_entries = max_entries
        self._clock = clock

    def seen(self, nonce: str) -> bool:
        now = self._clock()
        while self._entries:
            oldest, expires_at = next(iter(self._entries.items()))
            if expires_at > now:
                break
            del self._entries[oldest]
        if nonce in self._entries:
            return True
        self._entries[nonce] = now + self._ttl_s
        if len(self._entries) > self._max_entries:
            self._entries.popitem(last=False)
        return False


class Verifier:
    def __init__(
        self,
        secrets: Sequence[str],
        nonces: NonceStore | None = None,
        max_skew_s: float = MAX_SKEW_S,
        wall_clock: Callable[[], float] = time.time,
    ) -> None:
        if not secrets:
            raise ValueError("at least one signing secret is required")
        self._secrets = tuple(secrets)
        self._nonces = nonces if nonces is not None else NonceStore()
        self._max_skew_s = max_skew_s
        self._wall_clock = wall_clock

    def verify(self, headers: Mapping[str, str], method: str, path: str, query: str, body: bytes) -> str:
        timestamp = headers.get(TIMESTAMP_HEADER)
        nonce = headers.get(NONCE_HEADER)
        client_ip = headers.get(CLIENT_IP_HEADER)
        signature = headers.get(SIGNATURE_HEADER)
        if not (timestamp and nonce and client_ip and signature):
            raise SignatureError("missing_signature", "This API only accepts signed requests")
        if not timestamp.isdigit() or abs(self._wall_clock() - int(timestamp)) > self._max_skew_s:
            raise SignatureError("stale_signature", "The request timestamp is outside the allowed window")

        request = SignedRequest(timestamp, nonce, method, path, query, client_ip, body)
        valid = any(hmac.compare_digest(signature, sign(secret, request)) for secret in self._secrets)
        if not valid or len(nonce) > MAX_NONCE_LENGTH or not _is_ip(client_ip):
            raise SignatureError("bad_signature", "The request signature is not valid")
        if self._nonces.seen(nonce):
            raise SignatureError("replayed", "This signed request has already been used")
        return client_ip


def _is_ip(value: str) -> bool:
    try:
        ipaddress.ip_address(value)
    except ValueError:
        return False
    return True


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Print signed request headers for curl. Reads the secret from PP_SIGNING_SECRET."
    )
    parser.add_argument("path")
    parser.add_argument("--method", default="GET")
    parser.add_argument("--query", default="")
    parser.add_argument("--client-ip", default="203.0.113.10")
    parser.add_argument("--skew", type=int, default=0, help="seconds to shift the timestamp by")
    args = parser.parse_args(argv)

    secret = os.environ.get("PP_SIGNING_SECRET")
    if not secret:
        print("PP_SIGNING_SECRET is not set", file=sys.stderr)
        return 1
    headers = signed_headers(
        secret,
        args.method,
        args.path,
        args.query,
        args.client_ip,
        timestamp=int(time.time()) + args.skew,
    )
    print(" ".join(f"-H '{name}: {value}'" for name, value in headers.items()))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
