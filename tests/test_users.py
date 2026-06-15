"""Tests for user profile API endpoints.

Covers:
- GET /api/v1/users/me — authenticated, unauthenticated, expired token
- PATCH /api/v1/users/me — update display name, update CEFR level
"""

import uuid

import pytest
from httpx import AsyncClient

from app.core.security import create_access_token


class TestGetMe:
    """Tests for GET /api/v1/users/me."""

    async def test_get_me_authenticated(
        self, client: AsyncClient, registered_user: dict, auth_headers
    ) -> None:
        """An authenticated user can retrieve their profile."""
        response = await client.get(
            "/api/v1/users/me",
            headers=auth_headers(registered_user["access_token"]),
        )

        assert response.status_code == 200, f"Get me failed: {response.text}"
        data = response.json()
        assert data["email"] == registered_user["email"]
        assert data["display_name"] == registered_user["display_name"]
        assert data["cefr_level"] == "UNASSESSED"
        assert data["is_active"] is True
        assert "id" in data
        assert "created_at" in data

    async def test_get_me_unauthenticated(
        self, client: AsyncClient
    ) -> None:
        """Request without Authorization header returns 401."""
        response = await client.get("/api/v1/users/me")

        assert response.status_code == 401, (
            f"Expected 401, got {response.status_code}"
        )

    async def test_get_me_invalid_token(
        self, client: AsyncClient, auth_headers
    ) -> None:
        """Request with a malformed token returns 401."""
        response = await client.get(
            "/api/v1/users/me",
            headers=auth_headers("not-a-valid-jwt-token"),
        )

        assert response.status_code == 401

    async def test_get_me_wrong_auth_format(
        self, client: AsyncClient
    ) -> None:
        """Request with non-Bearer auth format returns 401."""
        response = await client.get(
            "/api/v1/users/me",
            headers={"Authorization": "Basic dGVzdDp0ZXN0"},
        )

        assert response.status_code == 401

    async def test_get_me_empty_auth_header(
        self, client: AsyncClient
    ) -> None:
        """Request with empty Authorization header returns 401."""
        response = await client.get(
            "/api/v1/users/me",
            headers={"Authorization": ""},
        )

        assert response.status_code == 401

    async def test_get_me_nonexistent_user_token(
        self, client: AsyncClient, auth_headers
    ) -> None:
        """Token with a non-existent user ID returns 401."""
        fake_token = create_access_token(
            {"sub": str(uuid.uuid4())}
        )
        response = await client.get(
            "/api/v1/users/me",
            headers=auth_headers(fake_token),
        )

        assert response.status_code == 401


class TestUpdateMe:
    """Tests for PATCH /api/v1/users/me."""

    async def test_update_display_name(
        self, client: AsyncClient, registered_user: dict, auth_headers
    ) -> None:
        """User can update their display name."""
        new_name = "Updated Name"
        response = await client.patch(
            "/api/v1/users/me",
            json={"display_name": new_name},
            headers=auth_headers(registered_user["access_token"]),
        )

        assert response.status_code == 200, f"Update failed: {response.text}"
        data = response.json()
        assert data["display_name"] == new_name

    async def test_update_cefr_level(
        self, client: AsyncClient, registered_user: dict, auth_headers
    ) -> None:
        """User can update their CEFR level."""
        response = await client.patch(
            "/api/v1/users/me",
            json={"cefr_level": "B2"},
            headers=auth_headers(registered_user["access_token"]),
        )

        assert response.status_code == 200, f"Update failed: {response.text}"
        data = response.json()
        assert data["cefr_level"] == "B2"

    async def test_update_both_fields(
        self, client: AsyncClient, registered_user: dict, auth_headers
    ) -> None:
        """User can update both display_name and cefr_level at once."""
        response = await client.patch(
            "/api/v1/users/me",
            json={"display_name": "Multi Update", "cefr_level": "C1"},
            headers=auth_headers(registered_user["access_token"]),
        )

        assert response.status_code == 200
        data = response.json()
        assert data["display_name"] == "Multi Update"
        assert data["cefr_level"] == "C1"

    async def test_update_empty_body(
        self, client: AsyncClient, registered_user: dict, auth_headers
    ) -> None:
        """Update with empty body keeps current values."""
        response = await client.patch(
            "/api/v1/users/me",
            json={},
            headers=auth_headers(registered_user["access_token"]),
        )

        assert response.status_code == 200
        data = response.json()
        assert data["display_name"] == registered_user["display_name"]
        assert data["cefr_level"] == "UNASSESSED"

    async def test_update_invalid_cefr_level(
        self, client: AsyncClient, registered_user: dict, auth_headers
    ) -> None:
        """Update with an invalid CEFR level returns 422."""
        response = await client.patch(
            "/api/v1/users/me",
            json={"cefr_level": "INVALID"},
            headers=auth_headers(registered_user["access_token"]),
        )

        assert response.status_code == 422

    async def test_update_unauthenticated(
        self, client: AsyncClient
    ) -> None:
        """Update without auth returns 401."""
        response = await client.patch(
            "/api/v1/users/me",
            json={"display_name": "No Auth"},
        )

        assert response.status_code == 401
