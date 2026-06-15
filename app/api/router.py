"""API route aggregation.

Central router that groups all API v1 endpoints. Sub-routers for specific
domains (auth, users, assessment, wordbank, llm, simultaneous) are mounted here.
"""

from fastapi import APIRouter

from app.api import admin, assessment, auth, llm, review, simultaneous, tts, users, wordbank

api_router = APIRouter(prefix="/api/v1")


@api_router.get("/health", tags=["health"])
async def api_health_check() -> dict:
    """API-level health check.

    Returns:
        dict with status and version information.
    """
    return {"status": "ok", "version": "1.0.0"}


# ── Sub-router registration ──────────────────────────────────────────

api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(users.router, prefix="/users", tags=["users"])
api_router.include_router(assessment.router, prefix="/assessment", tags=["assessment"])
api_router.include_router(wordbank.router, prefix="/wordbank", tags=["wordbank"])
api_router.include_router(llm.router, prefix="/llm", tags=["llm"])
api_router.include_router(simultaneous.router, tags=["translate"])
api_router.include_router(tts.router, tags=["tts"])
api_router.include_router(admin.router, tags=["admin"])
