"""Vocabulary models — shared word dictionary and per-user tracking."""

import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import (
    DateTime, ForeignKey, Integer, String, Text, UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class Word(Base):
    """Shared English vocabulary dictionary."""

    __tablename__ = "words"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4()),
    )
    word: Mapped[str] = mapped_column(String(200), unique=True, nullable=False, index=True)
    translation: Mapped[str] = mapped_column(String(500), nullable=False, default="")
    phonetic: Mapped[str] = mapped_column(String(200), nullable=False, default="")
    part_of_speech: Mapped[str] = mapped_column(String(50), nullable=False, default="")
    cefr_level: Mapped[str] = mapped_column(String(10), nullable=False, default="B1")
    example_sentence: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    example_translation: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    topic_tags: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)

    user_words: Mapped[list["UserWord"]] = relationship(back_populates="word", lazy="selectin")


class UserWord(Base):
    """Per-user vocabulary tracking."""

    __tablename__ = "user_words"
    __table_args__ = (UniqueConstraint("user_id", "word_id", name="uq_user_word"),)

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4()),
    )
    user_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    word_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("words.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    encounter_count: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="new")
    source: Mapped[str] = mapped_column(String(50), nullable=False, default="unknown")
    first_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)
    next_review_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    review_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    mastered_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship("User", back_populates="user_words", lazy="selectin")
    word: Mapped["Word"] = relationship(back_populates="user_words", lazy="selectin")
