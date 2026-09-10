from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError

from packagepulse import __version__
from packagepulse.errors import ProblemError, handle_problem, handle_validation
from packagepulse.graph import router as graph_router
from packagepulse.orchestrator import Orchestrator
from packagepulse.providers.base import Upstream
from packagepulse.routes import router
from packagepulse.scans import router as scans_router
from packagepulse.security.middleware import SignatureMiddleware
from packagepulse.security.rate_limit import Limits
from packagepulse.security.signature import Verifier
from packagepulse.settings import Settings, get_settings

USER_AGENT = f"packagepulse/{__version__} (+https://github.com/nish1013/packagepulse)"


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    show_docs = not settings.is_production

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        async with httpx.AsyncClient(
            timeout=httpx.Timeout(10.0),
            follow_redirects=True,
            headers={"User-Agent": USER_AGENT},
            limits=httpx.Limits(max_connections=100, max_keepalive_connections=20),
        ) as client:
            token = settings.github_token.get_secret_value() if settings.github_token else None
            app.state.orchestrator = Orchestrator(Upstream(client), github_token=token)
            yield

    app = FastAPI(
        title="PackagePulse",
        version=__version__,
        docs_url="/docs" if show_docs else None,
        redoc_url=None,
        openapi_url="/openapi.json" if show_docs else None,
        lifespan=lifespan,
    )
    app.state.limits = Limits(
        package_per_minute=settings.package_requests_per_minute,
        scans_per_10_minutes=settings.scans_per_10_minutes,
        streams_per_client=settings.streams_per_client,
        concurrent_scans=settings.concurrent_scans,
    )
    verifier = Verifier(settings.signing_secrets) if settings.signing_secrets else None
    exempt = ("/health", "/docs", "/openapi.json") if show_docs else ("/health",)
    app.add_middleware(SignatureMiddleware, verifier=verifier, exempt_paths=exempt)
    app.add_exception_handler(ProblemError, handle_problem)
    app.add_exception_handler(RequestValidationError, handle_validation)
    app.include_router(graph_router)
    app.include_router(router)
    app.include_router(scans_router)

    @app.get("/health", tags=["meta"])
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    return app


app = create_app()
