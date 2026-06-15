"""Test fixtures and configuration for LinguaLearn backend tests.

Provides:
- Async test client with overridden database dependency.
- SQLite in-memory database for fast, isolated test runs.
- Mocked DeepSeek API to avoid real API calls.
- Factory helpers for creating test users and tokens.
"""

import asyncio
import uuid
from datetime import timedelta
from typing import AsyncGenerator, Dict, Any

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.config import settings
from app.core.security import create_access_token, create_refresh_token
from app.db.session import get_db
from app.main import create_app
from app.models.base import Base


# ── Test database -------------------------------------------------------
# Use SQLite in-memory for fast, isolated tests.
# Note: SQLite doesn't support PG-specific types (UUID, JSON as native).
# We use the aiosqlite driver and disable PG-only features.

TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"

test_engine = create_async_engine(TEST_DATABASE_URL, echo=False, future=True)

TestSessionLocal = async_sessionmaker(
    bind=test_engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)


@pytest_asyncio.fixture(scope="session", autouse=True)
async def setup_database() -> AsyncGenerator[None, None]:
    """Create all tables once at session start and drop after all tests.

    Uses SQLite in-memory with shared connection so all tests see the
    same schema. Session scope avoids expensive per-test create/drop.
    """
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest_asyncio.fixture
async def db_session() -> AsyncGenerator[AsyncSession, None]:
    """Provide a database session for a single test.

    The session does NOT pre-start a transaction — the application
    service code calls commit()/rollback() directly. After the test,
    we roll back any pending changes for isolation.
    """
    async with TestSessionLocal() as session:
        yield session
        await session.rollback()
        await session.close()


@pytest_asyncio.fixture
async def client(db_session: AsyncSession) -> AsyncGenerator[AsyncClient, None]:
    """Provide an HTTPX AsyncClient bound to the test FastAPI app.

    The database dependency is overridden to use the test session.
    """
    app = create_app()

    async def override_get_db() -> AsyncGenerator[AsyncSession, None]:
        yield db_session

    app.dependency_overrides[get_db] = override_get_db

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac

    app.dependency_overrides.clear()


# ── Factory helpers -----------------------------------------------------

@pytest.fixture
def test_password() -> str:
    """Default test password."""
    return "TestPass123!"


@pytest_asyncio.fixture
async def registered_user(
    client: AsyncClient, test_password: str
) -> Dict[str, Any]:
    """Register a test user and return user info + tokens."""
    email = f"test_{uuid.uuid4().hex[:8]}@example.com"
    payload = {
        "email": email,
        "password": test_password,
        "display_name": "Test User",
    }
    response = await client.post("/api/v1/auth/register", json=payload)
    assert response.status_code == 201, f"Registration failed: {response.text}"
    data = response.json()
    return {
        "email": email,
        "password": test_password,
        "display_name": "Test User",
        "access_token": data["access_token"],
        "refresh_token": data["refresh_token"],
    }


@pytest.fixture
def auth_headers() -> callable:
    """Factory to generate Authorization headers from a token."""

    def _headers(token: str) -> Dict[str, str]:
        return {"Authorization": f"Bearer {token}"}

    return _headers


# ── Mock DeepSeek API ---------------------------------------------------

class MockDeepSeekResponse:
    """Mock httpx response for DeepSeek API calls."""

    def __init__(self, json_data: Dict[str, Any], status_code: int = 200):
        self._json = json_data
        self.status_code = status_code
        self.text = ""

    def json(self) -> Dict[str, Any]:
        return self._json

    def raise_for_status(self) -> None:
        if self.status_code >= 400:
            raise Exception(f"HTTP {self.status_code}")


def make_deepseek_eval_response(
    cefr_level: str = "B1",
    scores: Dict[str, int] | None = None,
    recommendations: list | None = None,
) -> Dict[str, Any]:
    """Build a mock DeepSeek evaluation response."""
    if scores is None:
        scores = {
            "listening_score": 65,
            "reading_score": 65,
            "speaking_score": 65,
            "writing_score": 65,
            "grammar_score": 65,
        }
    if recommendations is None:
        recommendations = [
            "Practice reading longer articles",
            "Work on writing complex sentences",
        ]

    return {
        "choices": [
            {
                "message": {
                    "content": f"""{{
        "cefr_level": "{cefr_level}",
        "listening_score": {scores.get("listening_score", 65)},
        "reading_score": {scores.get("reading_score", 65)},
        "speaking_score": {scores.get("speaking_score", 65)},
        "writing_score": {scores.get("writing_score", 65)},
        "grammar_score": {scores.get("grammar_score", 65)},
        "recommendations": {recommendations}
    }}"""
                }
            }
        ]
    }
