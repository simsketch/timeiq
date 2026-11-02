"""Time tracking and invoicing behind a per-account switch.

On for accounts that already use them (have clients); off for everyone else.

Revision ID: 033_invoicing_enabled
Revises: 032_push_devices
"""
import sqlalchemy as sa
from alembic import op

revision = "033_invoicing_enabled"
down_revision = "032_push_devices"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("invoicing_enabled", sa.Boolean(), nullable=False, server_default=sa.false()),
        schema="timeiq",
    )
    op.execute(
        "UPDATE timeiq.users u SET invoicing_enabled = true "
        "WHERE EXISTS (SELECT 1 FROM timeiq.clients c WHERE c.user_id = u.id)"
    )


def downgrade() -> None:
    op.drop_column("users", "invoicing_enabled", schema="timeiq")
