"""Create users table

Revision ID: 001
Revises: None
Create Date: 2025-01-15 00:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = "001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create the users table with UUID PK, unique email index, and CEFR enum."""
    op.create_table(
        "users",
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
            "email",
            sa.String(320),
            unique=True,
            index=True,
            nullable=False,
            comment="Unique email address used for login.",
        ),
        sa.Column(
            "password_hash",
            sa.String(128),
            nullable=False,
            comment="bcrypt hash of the user's password.",
        ),
        sa.Column(
            "display_name",
            sa.String(100),
            nullable=False,
            server_default="",
            comment="Human-readable display name.",
        ),
        sa.Column(
            "cefr_level",
            sa.Enum(
                "UNASSESSED",
                "A1",
                "A2",
                "B1",
                "B2",
                "C1",
                "C2",
                name="cefr_level_enum",
            ),
            nullable=False,
            server_default="UNASSESSED",
            comment="Current CEFR English proficiency level.",
        ),
        sa.Column(
            "is_active",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
            comment="Whether the user account is active.",
        ),
    )

    # Additional explicit index on email (created by unique=True above,
    # but listed here for clarity).
    op.create_index("ix_users_email", "users", ["email"])


def downgrade() -> None:
    """Drop the users table."""
    op.drop_index("ix_users_email", table_name="users")
    op.drop_table("users")
    op.execute("DROP TYPE IF EXISTS cefr_level_enum")
