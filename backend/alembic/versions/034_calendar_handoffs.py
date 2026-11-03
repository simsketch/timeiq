"""Google and Outlook sign-in started from the mobile app.

Revision ID: 034_calendar_handoffs
Revises: 033_invoicing_enabled
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "034_calendar_handoffs"
down_revision = "033_invoicing_enabled"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "calendar_handoffs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("timeiq.users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("provider", sa.String(20), nullable=False),
        sa.Column("launch_token_hash", sa.String(64), nullable=False, unique=True),
        sa.Column("app_challenge", sa.String(64), nullable=False),
        sa.Column("browser_secret", sa.String(128), nullable=False),
        sa.Column("code", sa.Text(), nullable=True),
        sa.Column("outcome", sa.String(20), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("launched_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        schema="timeiq",
    )
    op.create_index("ix_calendar_handoffs_user_id", "calendar_handoffs", ["user_id"], schema="timeiq")


def downgrade() -> None:
    op.drop_index("ix_calendar_handoffs_user_id", table_name="calendar_handoffs", schema="timeiq")
    op.drop_table("calendar_handoffs", schema="timeiq")
