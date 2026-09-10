import json
from dataclasses import replace
from pathlib import Path

import pytest

from packagepulse.errors import ProblemError
from packagepulse.security.rate_limit import Limits, RateLimiter, Rule
from packagepulse.security.signature import (
    NonceStore,
    SignatureError,
    SignedRequest,
    Verifier,
    sign,
    signed_headers,
)

SECRET = "test-secret"
NOW = 1_800_000_000
VECTORS = json.loads((Path(__file__).parent / "fixtures" / "signature_vectors.json").read_text())


@pytest.mark.parametrize("vector", VECTORS, ids=[vector["name"] for vector in VECTORS])
def test_signature_vectors(vector: dict[str, str]) -> None:
    request = SignedRequest(
        vector["timestamp"],
        vector["nonce"],
        vector["method"],
        vector["path"],
        vector["query"],
        vector["client_ip"],
        vector["body"].encode(),
    )

    assert request.canonical() == vector["canonical"]
    assert sign(vector["secret"], request) == vector["signature"]


class FakeClock:
    def __init__(self, now: float = 0.0) -> None:
        self.now = now

    def __call__(self) -> float:
        return self.now


def base_request() -> SignedRequest:
    return SignedRequest(
        timestamp=str(NOW),
        nonce="nonce-1",
        method="GET",
        path="/v1/packages/pypi/fastapi",
        query="",
        client_ip="203.0.113.10",
    )


def test_query_order_does_not_change_the_signature() -> None:
    request = base_request()

    assert sign(SECRET, replace(request, query="b=2&a=1")) == sign(SECRET, replace(request, query="a=1&b=2"))


def test_percent_encoding_does_not_change_the_signature() -> None:
    encoded = replace(base_request(), path="/v1/packages/npm/%40types%2Fnode")
    decoded = replace(base_request(), path="/v1/packages/npm/@types/node")

    assert sign(SECRET, encoded) == sign(SECRET, decoded)


@pytest.mark.parametrize(
    "change",
    [
        {"timestamp": str(NOW + 1)},
        {"nonce": "nonce-2"},
        {"method": "POST"},
        {"path": "/v1/packages/pypi/django"},
        {"query": "version=1.0"},
        {"client_ip": "203.0.113.11"},
        {"body": b"{}"},
    ],
)
def test_every_signed_part_changes_the_signature(change: dict[str, object]) -> None:
    request = base_request()

    assert sign(SECRET, request) != sign(SECRET, replace(request, **change))  # type: ignore[arg-type]


def verifier(*secrets: str, clock: FakeClock | None = None) -> Verifier:
    return Verifier(secrets or (SECRET,), NonceStore(), wall_clock=clock or FakeClock(NOW))


def headers_for(secret: str = SECRET, client_ip: str = "203.0.113.10") -> dict[str, str]:
    return signed_headers(secret, "GET", "/v1/packages/pypi/fastapi", client_ip=client_ip, timestamp=NOW)


def test_accepts_a_valid_request_and_returns_the_client_ip() -> None:
    client = verifier().verify(headers_for(), "GET", "/v1/packages/pypi/fastapi", "", b"")

    assert client == "203.0.113.10"


@pytest.mark.parametrize(
    ("mutate", "code"),
    [
        (lambda headers: headers.pop("x-pp-signature"), "missing_signature"),
        (lambda headers: headers.update({"x-pp-timestamp": str(NOW - 120)}), "stale_signature"),
        (lambda headers: headers.update({"x-pp-client-ip": "198.51.100.7"}), "bad_signature"),
        (lambda headers: headers.update({"x-pp-signature": "v1=" + "0" * 64}), "bad_signature"),
    ],
)
def test_rejects_invalid_requests(mutate: object, code: str) -> None:
    headers = headers_for()
    mutate(headers)  # type: ignore[operator]

    with pytest.raises(SignatureError) as caught:
        verifier().verify(headers, "GET", "/v1/packages/pypi/fastapi", "", b"")

    assert caught.value.code == code


def test_rejects_replayed_requests() -> None:
    check = verifier()
    headers = headers_for()
    check.verify(headers, "GET", "/v1/packages/pypi/fastapi", "", b"")

    with pytest.raises(SignatureError) as caught:
        check.verify(headers, "GET", "/v1/packages/pypi/fastapi", "", b"")

    assert caught.value.code == "replayed"


def test_accepts_the_previous_secret_during_rotation() -> None:
    headers = headers_for(secret="old-secret")

    client = verifier("new-secret", "old-secret").verify(headers, "GET", "/v1/packages/pypi/fastapi", "", b"")

    assert client == "203.0.113.10"


def test_nonces_expire() -> None:
    clock = FakeClock()
    nonces = NonceStore(ttl_s=120, clock=clock)

    assert not nonces.seen("a")
    assert nonces.seen("a")
    clock.now += 121
    assert not nonces.seen("a")


def test_rate_limiter_refills_over_time() -> None:
    clock = FakeClock()
    limiter = RateLimiter(clock)
    rule = Rule("package", capacity=2, per_seconds=60)

    assert limiter.hit("client", rule) is None
    assert limiter.hit("client", rule) is None
    assert limiter.hit("client", rule) == pytest.approx(30)
    assert limiter.hit("another-client", rule) is None

    clock.now += 30
    assert limiter.hit("client", rule) is None


def test_limits_cap_open_streams_per_client_and_scans_overall() -> None:
    limits = Limits(package_per_minute=30, scans_per_10_minutes=4, streams_per_client=1, concurrent_scans=1)

    release = limits.open_stream("a", scan=True)
    with pytest.raises(ProblemError) as too_many:
        limits.open_stream("a")
    with pytest.raises(ProblemError) as busy:
        limits.open_stream("b", scan=True)

    assert too_many.value.problem.code == "too_many_streams"
    assert busy.value.problem.code == "busy"
    release()
    limits.open_stream("b", scan=True)
