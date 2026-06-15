"""HTTP middleware stack.

Provides CORS configuration and request logging for observability.
"""

import time
import logging

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware

from app.config import settings

logger = logging.getLogger("lingualearn.middleware")


def setup_cors(app: FastAPI) -> None:
    """Register CORS middleware with origins from application settings.

    Args:
        app: The FastAPI application instance.
    """
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["X-Request-ID"],
    )


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """Logs every incoming HTTP request with method, path, and duration.

    Uses structured logging at INFO level so that request traces can be
    correlated with other application logs.
    """

    async def dispatch(self, request: Request, call_next):
        """Intercept request, measure duration, and log result.

        Args:
            request: The incoming Starlette/FastAPI request.
            call_next: The next middleware or endpoint handler in the chain.

        Returns:
            The HTTP response produced by the downstream handler.
        """
        start_time = time.monotonic()

        response = await call_next(request)

        duration_ms = (time.monotonic() - start_time) * 1000
        logger.info(
            "%s %s — %d (%.2f ms)",
            request.method,
            request.url.path,
            response.status_code,
            duration_ms,
        )

        return response
