"""User profile API routes.

Exposes endpoints for reading and updating the authenticated user's
own profile.
"""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.user import UserRead, UserUpdate
from app.services.user_service import UserService

router = APIRouter()


def _get_user_service() -> UserService:
    """Provide the UserService instance as a dependency."""
    return UserService()


@router.get("/me", response_model=UserRead)
async def get_me(
    current_user: User = Depends(get_current_user),
) -> UserRead:
    """Return the authenticated user's profile.

    Requires a valid Bearer token in the Authorization header.
    """
    return UserRead.model_validate(current_user)


@router.patch("/me", response_model=UserRead)
async def update_me(
    data: UserUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    user_service: UserService = Depends(_get_user_service),
) -> UserRead:
    """Update the authenticated user's profile.

    Only the provided fields are modified. Requires a valid Bearer token.

    Raises:
        422: If the request body fails validation.
    """
    updated = await user_service.update(db, current_user, data)
    return UserRead.model_validate(updated)
