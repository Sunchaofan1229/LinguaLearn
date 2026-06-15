"""Pydantic schemas for user profile read and update operations."""

from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field

from app.models.user import CEFRLevel


class UserRead(BaseModel):
    """Public user profile returned by read endpoints.

    Excludes sensitive fields like password_hash.
    """

    id: UUID = Field(..., description="Unique user identifier.")
    email: str = Field(..., description="User's email address.")
    display_name: str = Field(..., description="Human-readable display name.")
    cefr_level: CEFRLevel = Field(..., description="Current CEFR proficiency.")
    is_active: bool = Field(..., description="Account status.")
    created_at: datetime = Field(..., description="Account creation timestamp.")

    model_config = {"from_attributes": True}


class UserUpdate(BaseModel):
    """Request body for updating user profile fields.

    All fields are optional — only provided values are changed.
    """

    display_name: Optional[str] = Field(
        default=None,
        max_length=100,
        description="New display name (omit to keep current).",
    )
    cefr_level: Optional[CEFRLevel] = Field(
        default=None,
        description="Updated CEFR level (omit to keep current).",
    )
