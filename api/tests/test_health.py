from httpx import ASGITransport, AsyncClient

from packagepulse.main import create_app
from packagepulse.settings import Settings


def client_for(env: str) -> AsyncClient:
    app = create_app(Settings(env=env))
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


async def test_health_is_ok() -> None:
    async with client_for("test") as client:
        response = await client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


async def test_docs_are_hidden_in_production() -> None:
    async with client_for("production") as client:
        docs = await client.get("/docs")
        schema = await client.get("/openapi.json")

    assert docs.status_code == 404
    assert schema.status_code == 404


async def test_docs_are_available_outside_production() -> None:
    async with client_for("development") as client:
        schema = await client.get("/openapi.json")

    assert schema.status_code == 200
