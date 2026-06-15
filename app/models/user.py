"""User domain model."""

import enum
from typing import TYPE_CHECKING, Optional

from sqlalchemy import Boolean, Enum, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, UUIDMixin, TimestampMixin

if TYPE_CHECKING:
    from app.models.vocabulary import UserWord


class CEFRLevel(str, enum.Enum):
    """CEFR (Common European Framework of Reference) language levels.

    UNASSESSED indicates a new user who has not yet taken the placement test.
    """

    UNASSESSED = "UNASSESSED"
    A1 = "A1"
    A2 = "A2"
    B1 = "B1"
    B2 = "B2"
    C1 = "C1"
    C2 = "C2"


class User(Base, UUIDMixin, TimestampMixin):
    """Authenticated user of the LinguaLearn platform.

    Each user has a unique email used for login, a bcrypt-hashed password,
    and an optional display name. English proficiency is tracked via the
    CEFR level which is updated after each assessment.

    Attributes:
        email: Unique email address used for authentication.
        password_hash: bcrypt-hashed password (never stored in plaintext).
        display_name: Optional human-readable display name.
        cefr_level: Current English proficiency level.
        is_active: Whether the account is enabled.
    """

    __tablename__ = "users"

    email: Mapped[str] = mapped_column(
        String(320),
        unique=True,
        index=True,
        nullable=False,
        comment="Unique email address used for login.",
    )
    password_hash: Mapped[str] = mapped_column(
        String(128),
        nullable=False,
        comment="bcrypt hash of the user's password.",
    )
    display_name: Mapped[str] = mapped_column(
        String(100),
        default="",
        nullable=False,
        comment="Human-readable display name.",
    )
    cefr_level: Mapped[CEFRLevel] = mapped_column(
        Enum(CEFRLevel, name="cefr_level_enum"),
        default=CEFRLevel.UNASSESSED,
        nullable=False,
        comment="Current CEFR English proficiency level.",
    )
    is_active: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        nullable=False,
        comment="Whether the user account is active.",
    )

    # Relationships
    user_words: Mapped[list["UserWord"]] = relationship(
        "UserWord", back_populates="user", lazy="selectin",
    )

    def __repr__(self) -> str:
        return f"<User(id={self.id!r}, email={self.email!r})>"
