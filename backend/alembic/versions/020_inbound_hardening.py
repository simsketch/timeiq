"""Inbound email: retryable processing claims

Revision ID: 020_inbound_hardening
Revises: 019_agent_hardening
Create Date: 2026-10-27

"""
from alembic import op
import sqlalchemy as sa

revision = "020_inbound_hardening"
down_revision = "019_agent_hardening"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("email_imports", sa.Column("attempts", sa.Integer, nullable=False, server_default="1"), schema="timeiq")
    op.add_column("email_imports", sa.Column("claimed_at", sa.DateTime(timezone=True), nullable=True), schema="timeiq")
    op.add_column(
        "email_imports", sa.Column("retryable", sa.Boolean, nullable=False, server_default=sa.false()), schema="timeiq"
    )


def downgrade() -> None:
    for name in ("retryable", "claimed_at", "attempts"):
        op.drop_column("email_imports", name, schema="timeiq")
