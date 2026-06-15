"""
Application configuration via environment variables.

Uses pydantic-settings for type-safe configuration from env vars / .env files.
"""
from __future__ import annotations

from typing import Any

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Global application settings.

    Environment variables take precedence over .env file defaults.
    Sensitive values must be provided in production via environment.
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="allow",  # Allow extra env vars (containers inject many)
    )

    # ── Database ──────────────────────────────────────────────────
    database_url: str = (
        "postgresql+asyncpg://postgres:postgres@localhost:5432/lingualearn"
    )

    # ── Redis ─────────────────────────────────────────────────────
    redis_url: str = "redis://localhost:6379/0"

    # ── Authentication ────────────────────────────────────────────
    secret_key: str = "changeme-in-production-use-a-real-secret-key"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 30

    # ── CORS ──────────────────────────────────────────────────────
    cors_origins: list[str] = ["*"]

    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_cors_origins(cls, v: Any) -> list[str]:
        """Parse CORS origins from JSON string or list."""
        if isinstance(v, str):
            import json
            try:
                return json.loads(v)
            except (json.JSONDecodeError, TypeError):
                return [origin.strip() for origin in v.split(",") if origin.strip()]
        if isinstance(v, list):
            return v
        return ["*"]

    # ── LLM ───────────────────────────────────────────────────────
    deepseek_api_key: str = ""
    deepseek_base_url: str = "https://api.deepseek.com/v1"

    # ── TTS (Boson Higgs Audio v3) ───────────────────────────────
    boson_api_key: str = ""
    boson_api_base: str = "https://api.boson.ai/v1"

    # ── Application ───────────────────────────────────────────────
    app_name: str = "LinguaLearn API"
    app_version: str = "1.0.0"
    debug: bool = False
    log_level: str = "INFO"

    # ── Rate Limiting ─────────────────────────────────────────────
    rate_limit_enabled: bool = True
    rate_limit_requests_per_minute: int = 60


# Singleton instance.
settings = Settings()
