"""Create assessment_records table

Revision ID: 002
Revises: 001
Create Date: 2025-01-20 00:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "002"
down_revision: Union[str, None] = "001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create assessment_records table."""
    # cefr_level_enum already created by 001_users migration; create if not exists.
    op.create_table(
        "assessment_records",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            nullable=False,
            comment="Unique identifier for the record.",
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
            comment="Timestamp when the record was created.",
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
            comment="Timestamp when the record was last updated.",
        ),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
            comment="FK to the user who took this assessment.",
        ),
        sa.Column(
            "result_level",
            sa.Enum(
                "UNASSESSED",
                "A1",
                "A2",
                "B1",
                "B2",
                "C1",
                "C2",
                name="cefr_level_enum",
                create_type=False,
            ),
            nullable=False,
            comment="Determined CEFR proficiency level.",
        ),
        sa.Column("listening_score", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("reading_score", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("speaking_score", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("writing_score", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("grammar_score", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "raw_responses",
            postgresql.JSON(),
            nullable=False,
            server_default=sa.text("'{}'::json"),
        ),
        sa.Column(
            "assessed_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )

    op.create_index(
        "ix_assessment_records_user_result",
        "assessment_records",
        ["user_id", "result_level"],
    )


def downgrade() -> None:
    """Drop assessment_records table."""
    op.drop_index("ix_assessment_records_user_result", table_name="assessment_records")
    op.drop_table("assessment_records")
