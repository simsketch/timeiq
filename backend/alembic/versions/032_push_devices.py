"""Phones registered for push notifications.

Revision ID: 032_push_devices
Revises: 031_booking_guest_emails
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "032_push_devices"
down_revision = "031_booking_guest_emails"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "push_devices",
        sa.Column("token", sa.String(255), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("timeiq.users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("platform", sa.String(20), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=False),
        schema="timeiq",
    )
    op.create_index("ix_push_devices_user_id", "push_devices", ["user_id"], schema="timeiq")


def downgrade() -> None:
    op.drop_index("ix_push_devices_user_id", table_name="push_devices", schema="timeiq")
    op.drop_table("push_devices", schema="timeiq")
