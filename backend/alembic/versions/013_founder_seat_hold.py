"""Hold a founder seat while its checkout is open, so the cap can't be oversold

Revision ID: 013_founder_seat_hold
Revises: 012_booking_history_ical
Create Date: 2026-10-25

"""
from alembic import op
import sqlalchemy as sa

revision = "013_founder_seat_hold"
down_revision = "012_booking_history_ical"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("founder_reserved_until", sa.DateTime(timezone=True), nullable=True),
        schema="timeiq",
    )


def downgrade() -> None:
    op.drop_column("users", "founder_reserved_until", schema="timeiq")
