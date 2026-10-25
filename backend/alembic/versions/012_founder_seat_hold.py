"""Hold a founder seat while its checkout is open, so the cap can't be oversold

Revision ID: 012_founder_seat_hold
Revises: 011_calendar_health
Create Date: 2026-10-25

"""
from alembic import op
import sqlalchemy as sa

revision = "012_founder_seat_hold"
down_revision = "011_calendar_health"
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
