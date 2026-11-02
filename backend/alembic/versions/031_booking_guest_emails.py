"""Extra guests on a booking the host makes by hand.

Revision ID: 031_booking_guest_emails
Revises: 030_invoice_numbers_101
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "031_booking_guest_emails"
down_revision = "030_invoice_numbers_101"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "bookings",
        sa.Column("guest_emails", postgresql.JSONB(), nullable=False, server_default="[]"),
        schema="timeiq",
    )


def downgrade() -> None:
    op.drop_column("bookings", "guest_emails", schema="timeiq")
