import json
from collections.abc import AsyncIterator, Callable
from pathlib import Path
from typing import Any

import httpx
import pytest

from packagepulse.providers.base import Upstream

FIXTURES = Path(__file__).parent / "fixtures"


def load_fixture(name: str) -> Any:
    return json.loads((FIXTURES / name).read_text())


async def _no_sleep(_: float) -> None:
    return None


@pytest.fixture
def fixture() -> Callable[[str], Any]:
    return load_fixture


@pytest.fixture
async def upstream() -> AsyncIterator[Upstream]:
    async with httpx.AsyncClient() as client:
        yield Upstream(client, sleep=_no_sleep, jitter=lambda: 0.0)
