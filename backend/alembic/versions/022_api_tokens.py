"""Personal access tokens for the API and MCP server

Revision ID: 022_api_tokens
Revises: 021_booking_scene
Create Date: 2026-10-28

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "022_api_tokens"
down_revision = "021_booking_scene"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "api_tokens",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("timeiq.users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("token_hash", sa.String(64), nullable=False, unique=True),
        sa.Column("prefix", sa.String(16), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        schema="timeiq",
    )
    op.create_index("ix_timeiq_api_tokens_user_id", "api_tokens", ["user_id"], schema="timeiq")


def downgrade() -> None:
    op.drop_index("ix_timeiq_api_tokens_user_id", table_name="api_tokens", schema="timeiq")
    op.drop_table("api_tokens", schema="timeiq")
