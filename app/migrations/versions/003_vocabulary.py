"""003_vocabulary — words dictionary and user_words tracking tables.

Revision ID: 003
Revises: 002
Create Date: 2026-06-07
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "003"
down_revision: Union[str, None] = "002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── Words dictionary (shared) ──
    op.create_table(
        "words",
        sa.Column("id", postgresql.UUID(as_uuid=False), primary_key=True),
        sa.Column("word", sa.String(200), unique=True, nullable=False, index=True),
        sa.Column("translation", sa.String(500), nullable=False, server_default=""),
        sa.Column("phonetic", sa.String(200), nullable=False, server_default="",
                  comment="IPA phonetic notation"),
        sa.Column("part_of_speech", sa.String(50), nullable=False, server_default=""),
        sa.Column("cefr_level", sa.String(10), nullable=False, server_default="B1"),
        sa.Column("example_sentence", sa.Text, nullable=True),
        sa.Column("example_translation", sa.Text, nullable=True,
                  comment="Chinese translation of example sentence"),
        sa.Column("topic_tags", sa.Text, nullable=True,
                  comment="Comma-separated topic tags"),
        sa.Column("created_at", sa.DateTime(timezone=True),
                  server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True),
                  server_default=sa.func.now()),
    )

    # ── User-word tracking ──
    op.create_table(
        "user_words",
        sa.Column("id", postgresql.UUID(as_uuid=False), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=False),
                  sa.ForeignKey("users.id", ondelete="CASCADE"),
                  nullable=False, index=True),
        sa.Column("word_id", postgresql.UUID(as_uuid=False),
                  sa.ForeignKey("words.id", ondelete="CASCADE"),
                  nullable=False, index=True),
        sa.Column("encounter_count", sa.Integer, nullable=False, server_default="1",
                  comment="Total times user has seen this word"),
        sa.Column("status", sa.String(20), nullable=False, server_default="new",
                  comment="new / learning / practicing / mastered"),
        sa.Column("source", sa.String(50), nullable=False, server_default="unknown",
                  comment="ocr / chat / import / manual"),
        sa.Column("first_seen_at", sa.DateTime(timezone=True),
                  server_default=sa.func.now()),
        sa.Column("last_seen_at", sa.DateTime(timezone=True),
                  server_default=sa.func.now()),
        sa.Column("next_review_at", sa.DateTime(timezone=True), nullable=True,
                  comment="SM-2 scheduled review time"),
        sa.Column("review_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column("mastered_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True),
                  server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True),
                  server_default=sa.func.now()),
        sa.UniqueConstraint("user_id", "word_id", name="uq_user_word"),
    )

    op.create_index("idx_user_words_status", "user_words", ["user_id", "status"])
    op.create_index("idx_user_words_encounter", "user_words", ["user_id", sa.text("encounter_count DESC")])
    op.create_index("idx_user_words_review", "user_words", ["user_id", "next_review_at"])


def downgrade() -> None:
    op.drop_table("user_words")
    op.drop_table("words")
