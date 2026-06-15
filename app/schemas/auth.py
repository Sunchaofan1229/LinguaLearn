"""Pydantic schemas for authentication endpoints.

Defines request/response models for register, login, and token refresh
operations with built-in field validation.
"""

from typing import Optional

from pydantic import BaseModel, EmailStr, Field


class RegisterRequest(BaseModel):
    """Request body for user registration."""

    email: EmailStr = Field(..., description="User's email address.")
    password: str = Field(
        ...,
        min_length=8,
        max_length=128,
        description="Plaintext password (min 8 chars).",
    )
    display_name: str = Field(
        default="",
        max_length=100,
        description="Optional human-readable display name.",
    )


class LoginRequest(BaseModel):
    """Request body for user login."""

    email: EmailStr = Field(..., description="Registered email address.")
    password: str = Field(..., description="Plaintext password.")


class TokenResponse(BaseModel):
    """Response containing JWT tokens after successful authentication."""

    access_token: str = Field(..., description="Short-lived access JWT.")
    refresh_token: str = Field(..., description="Long-lived refresh JWT.")
    token_type: str = Field(default="bearer", description="Token type prefix.")
    expires_in: int = Field(
        default=1800,
        description="Access token lifetime in seconds (default 30 min).",
    )


class RefreshRequest(BaseModel):
    """Request body for token refresh."""

    refresh_token: str = Field(..., description="Long-lived refresh JWT.")
