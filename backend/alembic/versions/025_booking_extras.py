"""Booking notice, windows and email reminders.

Revision ID: 025_booking_extras
Revises: 024_outlook
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "025_booking_extras"
down_revision = "024_outlook"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("event_types", sa.Column("min_notice_minutes", sa.Integer(), nullable=False, server_default="0"), schema="timeiq")
    op.add_column("event_types", sa.Column("max_days_ahead", sa.Integer(), nullable=True), schema="timeiq")
    op.add_column("event_types", sa.Column("reminder_minutes", postgresql.JSONB(), nullable=False, server_default="[1440]"), schema="timeiq")
    op.add_column("event_types", sa.Column("remind_host", sa.Boolean(), nullable=False, server_default=sa.false()), schema="timeiq")
    op.add_column("bookings", sa.Column("reminder_sent", postgresql.JSONB(), nullable=False, server_default="[]"), schema="timeiq")
    op.create_index("ix_bookings_confirmed_starts_at", "bookings", ["starts_at"], schema="timeiq", postgresql_where=sa.text("status = 'confirmed'"))


def downgrade() -> None:
    op.drop_index("ix_bookings_confirmed_starts_at", table_name="bookings", schema="timeiq")
    op.drop_column("bookings", "reminder_sent", schema="timeiq")
    for column in ("remind_host", "reminder_minutes", "max_days_ahead", "min_notice_minutes"):
        op.drop_column("event_types", column, schema="timeiq")
