"""Authentication business logic.

Encapsulates register, login, and token refresh workflows as a service
layer between API routes and data access.
"""

import uuid
from datetime import timedelta

from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.exceptions import (
    ConflictException,
    UnauthorizedException,
    ValidationException,
)
from app.core.security import (
    create_access_token,
    create_refresh_token,
    hash_password,
    verify_password,
    verify_token,
)
from app.models.user import User
from app.schemas.auth import LoginRequest, RegisterRequest, TokenResponse
from app.services.user_service import UserService


class AuthService:
    """Handles authentication workflows: register, login, token refresh."""

    def __init__(self) -> None:
        self._user_service = UserService()

    async def register(
        self, db: AsyncSession, data: RegisterRequest
    ) -> TokenResponse:
        """Register a new user account and return tokens.

        Args:
            db: Active database session.
            data: Registration form data.

        Returns:
            TokenResponse with access and refresh tokens.

        Raises:
            ConflictException: If the email is already registered.
        """
        existing = await self._user_service.get_by_email(db, data.email)
        if existing:
            raise ConflictException("Email is already registered")

        user = User(
            email=data.email,
            password_hash=hash_password(data.password),
            display_name=data.display_name,
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)

        return self._build_tokens(user)

    async def login(
        self, db: AsyncSession, data: LoginRequest
    ) -> TokenResponse:
        """Authenticate a user by email and password.

        Args:
            db: Active database session.
            data: Login credentials.

        Returns:
            TokenResponse with access and refresh tokens.

        Raises:
            UnauthorizedException: If credentials are invalid or account is inactive.
        """
        user = await self._user_service.get_by_email(db, data.email)
        if not user:
            raise UnauthorizedException("Invalid email or password")

        if not verify_password(data.password, user.password_hash):
            raise UnauthorizedException("Invalid email or password")

        if not user.is_active:
            raise UnauthorizedException("Account is deactivated")

        return self._build_tokens(user)

    async def refresh_token(
        self, db: AsyncSession, refresh_token_value: str
    ) -> TokenResponse:
        """Issue a new access token using a valid refresh token.

        Args:
            db: Active database session.
            refresh_token_value: The long-lived refresh JWT.

        Returns:
            TokenResponse with a new access token and the same refresh token.

        Raises:
            UnauthorizedException: If the refresh token is invalid or the
                associated user no longer exists.
        """
        try:
            payload = verify_token(refresh_token_value)
        except ValueError as exc:
            raise UnauthorizedException(str(exc))

        user_id_str = payload.get("sub")
        if not user_id_str:
            raise UnauthorizedException("Invalid refresh token payload")

        try:
            user_id = uuid.UUID(user_id_str)
        except ValueError:
            raise UnauthorizedException("Invalid user ID in token")

        user = await self._user_service.get_by_id(db, user_id)
        if not user:
            raise UnauthorizedException("User not found")

        if not user.is_active:
            raise UnauthorizedException("Account is deactivated")

        return self._build_tokens(user)

    @staticmethod
    def _build_tokens(user: User) -> TokenResponse:
        """Build a TokenResponse with fresh access+refresh tokens for a user.

        Args:
            user: The authenticated User entity.

        Returns:
            TokenResponse with newly minted tokens.
        """
        token_data = {"sub": str(user.id)}
        access_token = create_access_token(token_data)
        refresh_token = create_refresh_token(token_data)
        return TokenResponse(
            access_token=access_token,
            refresh_token=refresh_token,
            token_type="bearer",
            expires_in=settings.access_token_expire_minutes * 60,
        )
