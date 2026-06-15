"""Authentication API routes.

Exposes endpoints for user registration, login, and token refresh.
"""

from fastapi import APIRouter, Depends
from app.core.exceptions import ConflictException
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.schemas.auth import (
    LoginRequest,
    RefreshRequest,
    RegisterRequest,
    TokenResponse,
)
from app.services.auth_service import AuthService

router = APIRouter()


def _get_auth_service() -> AuthService:
    """Provide the AuthService instance as a dependency."""
    return AuthService()


@router.post("/register", response_model=TokenResponse, status_code=201)
async def register(
    data: RegisterRequest,
    db: AsyncSession = Depends(get_db),
    auth_service: AuthService = Depends(_get_auth_service),
) -> TokenResponse:
    """Register a new user account.

    Creates a new user with the provided email, password, and optional
    display name. Returns JWT access and refresh tokens on success.

    Raises:
        409: If the email is already registered.
        422: If the request body fails validation.
    """
    return await auth_service.register(db, data)


@router.post("/login", response_model=TokenResponse)
async def login(
    data: LoginRequest,
    db: AsyncSession = Depends(get_db),
    auth_service: AuthService = Depends(_get_auth_service),
) -> TokenResponse:
    """Authenticate a user with email and password.

    Verifies credentials and returns JWT access and refresh tokens.

    Raises:
        401: If credentials are invalid or the account is deactivated.
    """
    return await auth_service.login(db, data)


@router.post("/refresh", response_model=TokenResponse)
async def refresh(
    data: RefreshRequest,
    db: AsyncSession = Depends(get_db),
    auth_service: AuthService = Depends(_get_auth_service),
) -> TokenResponse:
    """Refresh an access token using a valid refresh token.

    Returns a new access token. The refresh token itself is not rotated.

    Raises:
        401: If the refresh token is invalid or expired.
    """
    return await auth_service.refresh_token(db, data.refresh_token)

@router.post("/guest", response_model=TokenResponse)
async def guest_login(
    db: AsyncSession = Depends(get_db),
    auth_service: AuthService = Depends(_get_auth_service),
) -> TokenResponse:
    """Create/return guest account tokens for quick demo access."""
    import uuid as _uuid
    guest_email = f"guest_{_uuid.uuid4().hex[:8]}@lingualearn-guest.io"
    try:
        return await auth_service.register(
            db,
            RegisterRequest(email=guest_email, password="guest123", display_name="游客"),
        )
    except ConflictException:
        # Guest already exists, try login
        return await auth_service.login(
            db,
            LoginRequest(email=guest_email, password="guest123"),
        )

