"""Cryptographic and authentication utilities.

Provides JWT token creation/verification and bcrypt password hashing.
All secrets come from application settings.
"""

from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

from jose import JWTError, jwt
from passlib.context import CryptContext

from app.config import settings

# ── Password hashing ───────────────────────────────────────────────────

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    """Hash a plaintext password using bcrypt.

    Args:
        password: The plaintext password to hash.

    Returns:
        bcrypt hash string suitable for storage.
    """
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a plaintext password against a bcrypt hash.

    Args:
        plain_password: The plaintext password to check.
        hashed_password: The stored bcrypt hash.

    Returns:
        True if the password matches the hash, False otherwise.
    """
    return pwd_context.verify(plain_password, hashed_password)


# ── JWT Token management ───────────────────────────────────────────────

def _create_token(
    data: Dict[str, Any],
    expires_delta: Optional[timedelta] = None,
) -> str:
    """Internal helper: encode a JWT with the given payload and expiry.

    Args:
        data: Claims to include in the token payload.
        expires_delta: Optional custom lifetime. Defaults to 30 minutes.

    Returns:
        Encoded JWT string.
    """
    to_encode = data.copy()
    now = datetime.now(timezone.utc)
    expire = now + (expires_delta or timedelta(minutes=30))
    to_encode.update({"exp": expire, "iat": now})
    return jwt.encode(to_encode, settings.secret_key, algorithm=settings.jwt_algorithm)


def create_access_token(
    data: Dict[str, Any],
    expires_delta: Optional[timedelta] = None,
) -> str:
    """Create a short-lived JWT access token.

    Args:
        data: Claims to embed (should include at least "sub" with user id).
        expires_delta: Custom lifetime override.

    Returns:
        Encoded JWT access token string.
    """
    return _create_token(
        data,
        expires_delta or timedelta(minutes=settings.access_token_expire_minutes),
    )


def create_refresh_token(data: Dict[str, Any]) -> str:
    """Create a long-lived JWT refresh token (7 days).

    Args:
        data: Claims to embed (should include at least "sub" with user id).

    Returns:
        Encoded JWT refresh token string.
    """
    return _create_token(data, expires_delta=timedelta(days=7))


def verify_token(token: str) -> Dict[str, Any]:
    """Decode and verify a JWT token.

    Args:
        token: The encoded JWT string to verify.

    Returns:
        Decoded payload dictionary.

    Raises:
        ValueError: If the token is invalid, expired, or malformed.
    """
    try:
        payload = jwt.decode(
            token,
            settings.secret_key,
            algorithms=[settings.jwt_algorithm],
        )
        return payload
    except JWTError as exc:
        raise ValueError("Invalid or expired token") from exc
