"""User data-access service.

Provides CRUD operations for the User entity, abstracting SQLAlchemy
queries behind a clean service interface.
"""

from typing import Optional
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User
from app.schemas.user import UserUpdate


class UserService:
    """Stateless service for User entity operations."""

    async def get_by_id(
        self, db: AsyncSession, user_id: UUID
    ) -> Optional[User]:
        """Retrieve a user by their unique identifier.

        Args:
            db: Active database session.
            user_id: The UUID primary key.

        Returns:
            The User entity if found, or None.
        """
        result = await db.execute(select(User).where(User.id == user_id))
        return result.scalar_one_or_none()

    async def get_by_email(
        self, db: AsyncSession, email: str
    ) -> Optional[User]:
        """Retrieve a user by their email address.

        Args:
            db: Active database session.
            email: The user's email address (case-sensitive).

        Returns:
            The User entity if found, or None.
        """
        result = await db.execute(select(User).where(User.email == email))
        return result.scalar_one_or_none()

    async def update(
        self, db: AsyncSession, user: User, data: UserUpdate
    ) -> User:
        """Update select fields on an existing user.

        Only fields explicitly set (not None) in ``data`` are applied.

        Args:
            db: Active database session.
            user: The User entity to modify.
            data: Partial update payload.

        Returns:
            The updated User entity (refreshed from DB).
        """
        if data.display_name is not None:
            user.display_name = data.display_name
        if data.cefr_level is not None:
            user.cefr_level = data.cefr_level

        db.add(user)
        await db.commit()
        await db.refresh(user)
        return user
