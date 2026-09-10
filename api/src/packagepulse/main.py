from fastapi import FastAPI

from packagepulse import __version__
from packagepulse.settings import Settings, get_settings


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    # The interactive docs are for local development. In production the API only
    # answers the web app, so there is nothing public to browse.
    show_docs = not settings.is_production

    app = FastAPI(
        title="PackagePulse",
        version=__version__,
        docs_url="/docs" if show_docs else None,
        redoc_url=None,
        openapi_url="/openapi.json" if show_docs else None,
    )

    @app.get("/health", tags=["meta"])
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    return app


app = create_app()
