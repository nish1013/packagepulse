import json
from collections.abc import AsyncIterator, Callable
from pathlib import Path
from typing import Any

import httpx
import pytest
from httpx import ASGITransport, AsyncClient

from packagepulse.main import create_app
from packagepulse.providers.base import Upstream
from packagepulse.settings import Settings

FIXTURES = Path(__file__).parent / "fixtures"

type SseEvents = list[tuple[str, dict[str, Any]]]


def load_fixture(name: str) -> Any:
    return json.loads((FIXTURES / name).read_text())


def parse_sse(text: str) -> SseEvents:
    events = []
    for block in text.strip().split("\n\n"):
        lines = [line for line in block.splitlines() if not line.startswith(":")]
        if lines:
            name = next(line.removeprefix("event: ") for line in lines if line.startswith("event: "))
            data = next(line.removeprefix("data: ") for line in lines if line.startswith("data: "))
            events.append((name, json.loads(data)))
    return events


async def _no_sleep(_: float) -> None:
    return None


@pytest.fixture
def fixture() -> Callable[[str], Any]:
    return load_fixture


@pytest.fixture
def sse() -> Callable[[str], SseEvents]:
    return parse_sse


@pytest.fixture
async def upstream() -> AsyncIterator[Upstream]:
    async with httpx.AsyncClient() as client:
        yield Upstream(client, sleep=_no_sleep, jitter=lambda: 0.0)


@pytest.fixture
async def api() -> AsyncIterator[AsyncClient]:
    settings = Settings(
        env="test", signing_secret=None, package_requests_per_minute=1000, scans_per_10_minutes=1000
    )
    app = create_app(settings)
    async with (
        app.router.lifespan_context(app),
        AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client,
    ):
        yield client
