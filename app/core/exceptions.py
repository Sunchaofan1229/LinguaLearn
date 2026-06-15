"""Global exception handling.

Defines a custom application exception hierarchy and registers top-level
exception handlers on the FastAPI app so that all errors produce
consistent JSON responses.
"""

import logging
from typing import Optional

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

logger = logging.getLogger("lingualearn.exceptions")


class AppException(Exception):
    """Base application exception with structured fields.

    All domain-level exceptions should inherit from this class so that
    the global handler can produce a uniform error response shape.

    Attributes:
        code: Machine-readable error code (e.g. "AUTH_INVALID_TOKEN").
        message: Human-readable error description.
        status_code: HTTP status code to return.
        details: Optional dict with additional error context.
    """

    def __init__(
        self,
        code: str,
        message: str,
        status_code: int = 400,
        details: Optional[dict] = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code
        self.details = details or {}


# ── Convenience exception subclasses ──────────────────────────────────

class NotFoundException(AppException):
    """Resource not found (HTTP 404)."""

    def __init__(self, message: str = "Resource not found") -> None:
        super().__init__(code="NOT_FOUND", message=message, status_code=404)


class UnauthorizedException(AppException):
    """Authentication required (HTTP 401)."""

    def __init__(self, message: str = "Unauthorized") -> None:
        super().__init__(code="UNAUTHORIZED", message=message, status_code=401)


class ForbiddenException(AppException):
    """Insufficient permissions (HTTP 403)."""

    def __init__(self, message: str = "Forbidden") -> None:
        super().__init__(code="FORBIDDEN", message=message, status_code=403)


class ValidationException(AppException):
    """Request validation failure (HTTP 422)."""

    def __init__(self, message: str = "Validation error") -> None:
        super().__init__(code="VALIDATION_ERROR", message=message, status_code=422)


class ConflictException(AppException):
    """Resource conflict (HTTP 409)."""

    def __init__(self, message: str = "Resource already exists") -> None:
        super().__init__(code="CONFLICT", message=message, status_code=409)


def register_exception_handlers(app: FastAPI) -> None:
    """Register global exception handlers on the FastAPI application.

    Args:
        app: The FastAPI application instance to register handlers on.
    """

    @app.exception_handler(AppException)
    async def app_exception_handler(request: Request, exc: AppException) -> JSONResponse:
        """Handle known application exceptions with structured responses."""
        logger.warning(
            "AppException: %s — %s (status=%d)",
            exc.code,
            exc.message,
            exc.status_code,
        )
        return JSONResponse(
            status_code=exc.status_code,
            content={
                "error": {
                    "code": exc.code,
                    "message": exc.message,
                    "details": exc.details,
                }
            },
        )

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(
        request: Request, exc: Exception
    ) -> JSONResponse:
        """Catch-all handler for unexpected errors.

        In production this should not leak stack traces. The full exception
        is logged server-side for debugging.
        """
        logger.exception("Unhandled exception: %s", str(exc))
        return JSONResponse(
            status_code=500,
            content={
                "error": {
                    "code": "INTERNAL_ERROR",
                    "message": "An unexpected error occurred. Please try again later.",
                    "details": {},
                }
            },
        )
