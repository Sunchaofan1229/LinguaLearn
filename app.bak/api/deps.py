"""FastAPI dependency injection helpers.

Provides reusable dependency functions for extracting the current
authenticated user from request headers.
"""

from typing import Optional
from uuid import UUID

from fastapi import Depends, Header
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import UnauthorizedException
from app.core.security import verify_token
from app.db.session import get_db
from app.models.user import User
from app.services.user_service import UserService


async def get_current_user(
    authorization: Optional[str] = Header(default=None, alias="Authorization"),
    db: AsyncSession = Depends(get_db),
) -> User:
    """Extract and validate the current user from the Authorization header.

    Expects the header in the format ``Bearer <token>``. Decodes the JWT,
    extracts the ``sub`` claim as the user ID, and loads the corresponding
    User from the database.

    Args:
        authorization: The ``Authorization`` HTTP header value.
        db: Async database session (injected by FastAPI).

    Returns:
        The authenticated User entity.

    Raises:
        UnauthorizedException: If the header is missing, malformed, the
            token is invalid/expired, or the user does not exist.
    """
    if not authorization:
        raise UnauthorizedException("Missing Authorization header")

    parts = authorization.split()
    if len(parts) != 2 or parts[0].lower() != "bearer":
        raise UnauthorizedException("Invalid Authorization header format")

    token = parts[1]

    try:
        payload = verify_token(token)
    except ValueError as exc:
        raise UnauthorizedException(str(exc))

    user_id_str: Optional[str] = payload.get("sub")
    if not user_id_str:
        raise UnauthorizedException("Token missing 'sub' claim")

    try:
        user_id = UUID(user_id_str)
    except ValueError:
        raise UnauthorizedException("Invalid user ID in token")

    service = UserService()
    user = await service.get_by_id(db, user_id)
    if not user:
        raise UnauthorizedException("User not found")

    if not user.is_active:
        raise UnauthorizedException("User account is deactivated")

    return user
