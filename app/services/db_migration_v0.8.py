"""Database migration for v0.8 — add ease_factor to user_words."""
import logging
from sqlalchemy import text
from app.db.session import engine

logger = logging.getLogger(__name__)


async def run_migration():
    """Add ease_factor column if it doesn't exist."""
    async with engine.begin() as conn:
        # Check if column exists
        result = await conn.execute(
            text(
                "SELECT column_name FROM information_schema.columns "
                "WHERE table_name='user_words' AND column_name='ease_factor'"
            )
        )
        if not result.scalar():
            logger.info("Adding ease_factor column to user_words...")
            await conn.execute(
                text(
                    "ALTER TABLE user_words "
                    "ADD COLUMN ease_factor FLOAT DEFAULT 2.5"
                )
            )
            logger.info("Migration complete: ease_factor added.")
        else:
            logger.info("ease_factor column already exists, skipping.")
