"""Vocabulary domain models."""

import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, UUIDMixin, TimestampMixin


class Word(Base, UUIDMixin, TimestampMixin):
    """Master word bank."""

    __tablename__ = "words"

    word: Mapped[str] = mapped_column(
        String(200), unique=True, index=True, nullable=False,
    )
    translation: Mapped[str] = mapped_column(
        String(500), default="", nullable=False,
    )
    phonetic: Mapped[str] = mapped_column(
        String(200), default="", nullable=False,
    )
    part_of_speech: Mapped[str] = mapped_column(
        String(50), default="", nullable=False,
    )
    cefr_level: Mapped[str] = mapped_column(
        String(10), default="B1", nullable=False,
    )
    example_sentence: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    example_translation: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    topic_tags: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    user_words: Mapped[list["UserWord"]] = relationship(
        "UserWord", back_populates="word_ref", lazy="selectin"
    )


class UserWord(Base, UUIDMixin, TimestampMixin):
    """User word progress tracking."""

    __tablename__ = "user_words"
    __table_args__ = (
        UniqueConstraint("user_id", "word_id", name="uq_user_word"),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True, nullable=False,
    )
    word_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("words.id", ondelete="CASCADE"),
        index=True, nullable=False,
    )
    encounter_count: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="new", nullable=False)
    source: Mapped[str] = mapped_column(String(50), default="unknown", nullable=False)
    first_seen_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True,
    )
    last_seen_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True,
    )
    next_review_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True,
    )
    review_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    mastered_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True,
    )

    word_ref: Mapped["Word"] = relationship("Word", back_populates="user_words")

