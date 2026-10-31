"""Outbox for transactional emails that failed to send, and booking source limits.

Revision ID: 029_outbound_emails
Revises: 028_agent_address
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "029_outbound_emails"
down_revision = "028_agent_address"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "outbound_emails",
        sa.Column("key", sa.String(256), primary_key=True),
        sa.Column("what", sa.String(100), nullable=False),
        sa.Column("payload", postgresql.JSONB(), nullable=False),
        sa.Column("attempts", sa.Integer(), nullable=False),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("next_attempt_at", sa.DateTime(timezone=True), nullable=False),
        schema="timeiq",
    )
    op.create_index("ix_timeiq_outbound_emails_next_attempt_at", "outbound_emails", ["next_attempt_at"], schema="timeiq")
    op.add_column("bookings", sa.Column("source_ip_hash", sa.String(64), nullable=True), schema="timeiq")
    op.create_index("ix_bookings_source_ip_hash_created_at", "bookings", ["source_ip_hash", "created_at"], schema="timeiq")


def downgrade() -> None:
    op.drop_index("ix_bookings_source_ip_hash_created_at", "bookings", schema="timeiq")
    op.drop_column("bookings", "source_ip_hash", schema="timeiq")
    op.drop_table("outbound_emails", schema="timeiq")
