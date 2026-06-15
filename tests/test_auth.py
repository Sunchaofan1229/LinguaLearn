"""Tests for authentication API endpoints.

Covers:
- POST /api/v1/auth/register — success, duplicate email, weak password
- POST /api/v1/auth/login — success, wrong password, non-existent user
- POST /api/v1/auth/refresh — success, invalid token
"""

import uuid

import pytest
from httpx import AsyncClient


class TestRegister:
    """Tests for POST /api/v1/auth/register."""

    async def test_register_success(
        self, client: AsyncClient, test_password: str
    ) -> None:
        """A new user can register and receive valid tokens."""
        email = f"new_{uuid.uuid4().hex[:8]}@example.com"
        payload = {
            "email": email,
            "password": test_password,
            "display_name": "Alice",
        }

        response = await client.post("/api/v1/auth/register", json=payload)

        assert response.status_code == 201, f"Unexpected status: {response.text}"
        data = response.json()
        assert "access_token" in data
        assert "refresh_token" in data
        assert data["token_type"] == "bearer"
        assert data["expires_in"] == 1800

    async def test_register_duplicate_email(
        self, client: AsyncClient, registered_user: dict
    ) -> None:
        """Registering with an existing email returns 409 Conflict."""
        payload = {
            "email": registered_user["email"],
            "password": "AnotherPass456!",
        }

        response = await client.post("/api/v1/auth/register", json=payload)

        assert response.status_code == 409, f"Expected 409, got {response.status_code}: {response.text}"
        error = response.json()["error"]
        assert error["code"] == "CONFLICT"
        assert "already registered" in error["message"].lower()

    async def test_register_weak_password_short(
        self, client: AsyncClient
    ) -> None:
        """Registering with a password shorter than 8 chars returns 422."""
        email = f"weak_{uuid.uuid4().hex[:8]}@example.com"
        payload = {
            "email": email,
            "password": "Ab1!",  # Only 4 chars
        }

        response = await client.post("/api/v1/auth/register", json=payload)

        assert response.status_code == 422, (
            f"Expected 422 for short password, got {response.status_code}"
        )

    async def test_register_invalid_email(
        self, client: AsyncClient, test_password: str
    ) -> None:
        """Registering with an invalid email returns 422."""
        payload = {
            "email": "not-an-email",
            "password": test_password,
        }

        response = await client.post("/api/v1/auth/register", json=payload)

        assert response.status_code == 422, (
            f"Expected 422 for invalid email, got {response.status_code}"
        )

    async def test_register_empty_display_name_defaults(
        self, client: AsyncClient, test_password: str
    ) -> None:
        """Registering without display_name should succeed (default empty)."""
        email = f"noname_{uuid.uuid4().hex[:8]}@example.com"
        payload = {"email": email, "password": test_password}

        response = await client.post("/api/v1/auth/register", json=payload)

        assert response.status_code == 201


class TestLogin:
    """Tests for POST /api/v1/auth/login."""

    async def test_login_success(
        self, client: AsyncClient, registered_user: dict
    ) -> None:
        """A registered user can log in and receive tokens."""
        payload = {
            "email": registered_user["email"],
            "password": registered_user["password"],
        }

        response = await client.post("/api/v1/auth/login", json=payload)

        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "access_token" in data
        assert "refresh_token" in data
        assert data["token_type"] == "bearer"

    async def test_login_wrong_password(
        self, client: AsyncClient, registered_user: dict
    ) -> None:
        """Login with incorrect password returns 401."""
        payload = {
            "email": registered_user["email"],
            "password": "WrongPassword999!",
        }

        response = await client.post("/api/v1/auth/login", json=payload)

        assert response.status_code == 401, (
            f"Expected 401 for wrong password, got {response.status_code}"
        )
        error = response.json()["error"]
        assert error["code"] == "UNAUTHORIZED"

    async def test_login_non_existent_user(
        self, client: AsyncClient
    ) -> None:
        """Login with an email that does not exist returns 401."""
        payload = {
            "email": "ghost@example.com",
            "password": "SomePass123!",
        }

        response = await client.post("/api/v1/auth/login", json=payload)

        assert response.status_code == 401, (
            f"Expected 401 for non-existent user, got {response.status_code}"
        )

    async def test_login_missing_password(
        self, client: AsyncClient, registered_user: dict
    ) -> None:
        """Login without password field returns 422."""
        payload = {"email": registered_user["email"]}

        response = await client.post("/api/v1/auth/login", json=payload)

        assert response.status_code == 422


class TestRefreshToken:
    """Tests for POST /api/v1/auth/refresh."""

    async def test_refresh_success(
        self, client: AsyncClient, registered_user: dict
    ) -> None:
        """A valid refresh token returns new access/refresh tokens."""
        payload = {"refresh_token": registered_user["refresh_token"]}

        response = await client.post("/api/v1/auth/refresh", json=payload)

        assert response.status_code == 200, f"Refresh failed: {response.text}"
        data = response.json()
        assert "access_token" in data
        assert "refresh_token" in data

    async def test_refresh_with_invalid_token(
        self, client: AsyncClient
    ) -> None:
        """An invalid refresh token returns 401."""
        payload = {"refresh_token": "not.a.valid.token"}

        response = await client.post("/api/v1/auth/refresh", json=payload)

        assert response.status_code == 401, (
            f"Expected 401 for invalid token, got {response.status_code}"
        )

    async def test_refresh_with_garbage_token(
        self, client: AsyncClient
    ) -> None:
        """A garbage refresh token returns 401."""
        payload = {"refresh_token": "garbage"}

        response = await client.post("/api/v1/auth/refresh", json=payload)

        assert response.status_code == 401

    async def test_refresh_missing_token(
        self, client: AsyncClient
    ) -> None:
        """Refresh without a token returns 422."""
        response = await client.post("/api/v1/auth/refresh", json={})

        assert response.status_code == 422
