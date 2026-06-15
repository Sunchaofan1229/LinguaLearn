"""FastAPI application entry point.

Sets up the application instance, registers middleware, routers, exception
handlers, and manages the startup/shutdown lifespan.
"""

from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from app.config import settings
from app.api.router import api_router
from app.core.middleware import setup_cors, RequestLoggingMiddleware
from app.core.exceptions import AppException, register_exception_handlers


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Application lifespan handler.

    On startup: initializes database engine and Redis connection pool.
    On shutdown: gracefully disconnects from database and Redis.
    """
    # Startup
    from app.db.session import engine
    from app.db.redis import redis_pool

    # Verify the database engine can connect (lazy — first request will
    # trigger the actual connection).
    app.state.db_engine = engine
    app.state.redis_pool = redis_pool

    yield

    # Shutdown
    await engine.dispose()
    await redis_pool.aclose()


def create_app() -> FastAPI:
    """Factory that creates and configures the FastAPI application.

    Returns:
        Fully configured FastAPI instance ready to serve requests.
    """
    app = FastAPI(
        title=settings.app_name,
        version=settings.app_version,
        description=(
            "AI-powered English learning platform for Chinese students. "
            "Provides vocabulary assessment, conversational practice, "
            "and personalized learning reports."
        ),
        lifespan=lifespan,
    )

    # ── Middleware ────────────────────────────────────────────────────
    setup_cors(app)
    app.add_middleware(RequestLoggingMiddleware)

    # ── Routers ───────────────────────────────────────────────────────
    app.include_router(api_router)

    # Inline health-check at root level for convenience.
    @app.get("/health", tags=["health"])
    async def health_check() -> dict:
        """Global health check endpoint."""
        return {"status": "ok", "version": settings.app_version}

    # ── Exception handlers ────────────────────────────────────────────
    register_exception_handlers(app)

    return app


# Module-level application instance (used by uvicorn).
app = create_app()
