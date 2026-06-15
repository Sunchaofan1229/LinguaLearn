"""SQLAlchemy declarative base and common model mixins.

All domain models should inherit from :class:`Base` and may optionally
include the :class:`TimestampMixin` for automatic created_at / updated_at
tracking.
"""

import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    """Declarative base class for all SQLAlchemy ORM models.

    Every model that maps to a database table must inherit from this class.
    """

    pass


class UUIDMixin:
    """Mixin that adds a UUID primary key column named ``id``.

    Uses PostgreSQL's native UUID type for efficient storage. The default
    value is generated client-side via Python's uuid4.
    """

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        comment="Unique identifier for the record.",
    )


class TimestampMixin:
    """Mixin that adds ``created_at`` and ``updated_at`` timestamp columns.

    - ``created_at`` is set once when the row is first inserted.
    - ``updated_at`` is set on insert and automatically updated on every
      subsequent modification via a server-side trigger or application logic.
    """

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
        nullable=False,
        comment="Timestamp when the record was created.",
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
        comment="Timestamp when the record was last updated.",
    )
