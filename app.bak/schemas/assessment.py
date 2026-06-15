"""Pydantic schemas for CEFR assessment.

Defines request/response models for the placement test evaluation flow.
"""

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field

from app.models.user import CEFRLevel


# ── Questions ──────────────────────────────────────────────────────────

class AssessmentQuestionOption(BaseModel):
    """A single multiple-choice option."""

    key: str = Field(..., description="Option identifier (A/B/C/D).")
    text: str = Field(..., description="Option text content.")


class AssessmentQuestion(BaseModel):
    """A single assessment question.

    Supports three question types: multiple-choice, fill-in-the-blank,
    and short translation.
    """

    id: str = Field(..., description="Unique question identifier.")
    type: str = Field(
        ...,
        description="Question type: 'choice' | 'fill_blank' | 'translation'.",
        examples=["choice", "fill_blank", "translation"],
    )
    prompt: str = Field(..., description="Question prompt displayed to the user.")
    options: Optional[List[AssessmentQuestionOption]] = Field(
        default=None,
        description="List of options (for choice type only).",
    )
    correct_answer: str = Field(
        ...,
        description="Expected correct answer (for server-side evaluation).",
    )


# ── Submission ─────────────────────────────────────────────────────────

class AssessmentAnswer(BaseModel):
    """A single user answer within a submission."""

    question_id: str = Field(..., description="ID of the question being answered.")
    user_answer: str = Field(..., description="The user's submitted answer.")


class AssessmentSubmit(BaseModel):
    """Request body for submitting assessment answers."""

    answers: List[AssessmentAnswer] = Field(
        ...,
        min_length=1,
        description="List of user answers to evaluate.",
    )


# ── Results ────────────────────────────────────────────────────────────

class AssessmentResult(BaseModel):
    """Assessment evaluation result returned to the user."""

    cefr_level: CEFRLevel = Field(..., description="Determined CEFR proficiency level.")
    listening_score: int = Field(..., ge=0, le=100, description="Listening score (0-100).")
    reading_score: int = Field(..., ge=0, le=100, description="Reading score (0-100).")
    speaking_score: int = Field(..., ge=0, le=100, description="Speaking score (0-100).")
    writing_score: int = Field(..., ge=0, le=100, description="Writing score (0-100).")
    grammar_score: int = Field(..., ge=0, le=100, description="Grammar score (0-100).")
    recommendations: List[str] = Field(
        default_factory=list,
        description="Personalized learning recommendations.",
    )
