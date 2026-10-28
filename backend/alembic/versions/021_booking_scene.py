"""Booking page scene choice

Revision ID: 021_booking_scene
Revises: 020_inbound_hardening
Create Date: 2026-10-27

"""
from alembic import op
import sqlalchemy as sa

revision = "021_booking_scene"
down_revision = "020_inbound_hardening"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("booking_scene", sa.String(32), nullable=True), schema="timeiq")


def downgrade() -> None:
    op.drop_column("users", "booking_scene", schema="timeiq")
