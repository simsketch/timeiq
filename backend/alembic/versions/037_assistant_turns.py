"""Assistant turns, for per-user limits and token usage.

Revision ID: 037_assistant_turns
Revises: 036_signup_attribution
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "037_assistant_turns"
down_revision = "036_signup_attribution"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "assistant_turns",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("timeiq.users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("input_tokens", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("output_tokens", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("model", sa.String(100), nullable=False, server_default=""),
        schema="timeiq",
    )
    op.create_index("ix_assistant_turns_user_created", "assistant_turns", ["user_id", "created_at"], schema="timeiq")


def downgrade() -> None:
    op.drop_index("ix_assistant_turns_user_created", table_name="assistant_turns", schema="timeiq")
    op.drop_table("assistant_turns", schema="timeiq")
