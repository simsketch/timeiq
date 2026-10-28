"""Booking email replies and weekly summaries.

Revision ID: 027_agent_summary
Revises: 026_paid_bookings
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "027_agent_summary"
down_revision = "026_paid_bookings"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("agent_message_claims", sa.Column("reply_context", postgresql.JSONB(), nullable=True), schema="timeiq")
    op.add_column("users", sa.Column("weekly_summary_enabled", sa.Boolean(), nullable=False, server_default=sa.true()), schema="timeiq")
    op.add_column("users", sa.Column("weekly_summary_sent_at", sa.DateTime(timezone=True), nullable=True), schema="timeiq")
    op.add_column("bookings", sa.Column("email_thread_ids", postgresql.JSONB(), nullable=False, server_default="[]"), schema="timeiq")
    op.add_column("bookings", sa.Column("reschedule_offers", postgresql.JSONB(), nullable=False, server_default="{}"), schema="timeiq")


def downgrade() -> None:
    op.drop_column("agent_message_claims", "reply_context", schema="timeiq")
    op.drop_column("bookings", "reschedule_offers", schema="timeiq")
    op.drop_column("bookings", "email_thread_ids", schema="timeiq")
    op.drop_column("users", "weekly_summary_sent_at", schema="timeiq")
    op.drop_column("users", "weekly_summary_enabled", schema="timeiq")
