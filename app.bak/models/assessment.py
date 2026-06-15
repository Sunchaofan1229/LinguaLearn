"""Assessment record domain model.

Stores the results of CEFR proficiency assessments for each user.
Each record captures the determined level, per-skill scores, and
raw response data for future analysis.
"""

from datetime import datetime
from typing import Any, Dict
from uuid import UUID

from sqlalchemy import DateTime, Enum, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import JSON, UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, UUIDMixin, TimestampMixin
from app.models.user import CEFRLevel


class AssessmentRecord(Base, UUIDMixin, TimestampMixin):
    """Persistent record of a single CEFR placement test result.

    Each record is associated with one user and captures per-skill
    scores plus the raw submitted responses for audit/debugging.

    Attributes:
        user_id: FK to the users table.
        result_level: The determined CEFR level.
        listening_score: Listening comprehension score (0-100).
        reading_score: Reading comprehension score (0-100).
        speaking_score: Speaking proficiency score (0-100).
        writing_score: Writing proficiency score (0-100).
        grammar_score: Grammar accuracy score (0-100).
        raw_responses: Original user answers stored as JSON.
        assessed_at: Timestamp when the assessment was completed.
    """

    __tablename__ = "assessment_records"

    user_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
        comment="FK to the user who took this assessment.",
    )
    result_level: Mapped[CEFRLevel] = mapped_column(
        Enum(CEFRLevel, name="cefr_level_enum"),
        nullable=False,
        comment="Determined CEFR proficiency level.",
    )
    listening_score: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
        comment="Listening score (0-100).",
    )
    reading_score: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
        comment="Reading score (0-100).",
    )
    speaking_score: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
        comment="Speaking score (0-100).",
    )
    writing_score: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
        comment="Writing score (0-100).",
    )
    grammar_score: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
        comment="Grammar score (0-100).",
    )
    raw_responses: Mapped[Dict[str, Any]] = mapped_column(
        JSON,
        nullable=False,
        default=dict,
        comment="Original user answers stored as JSON.",
    )
    assessed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=datetime.utcnow,
        comment="When the assessment was completed.",
    )

    user: Mapped["User"] = relationship("User", backref="assessments")  # noqa: F821

    def __repr__(self) -> str:
        return (
            f"<AssessmentRecord(id={self.id!r}, user_id={self.user_id!r}, "
            f"level={self.result_level!r})>"
        )
