"""Track calendar sync health so broken feeds back off and get reported

Revision ID: 011_calendar_health
Revises: 010_weekly_toggle
Create Date: 2026-10-25

"""
from alembic import op
import sqlalchemy as sa

revision = "011_calendar_health"
down_revision = "010_weekly_toggle"
branch_labels = None
depends_on = None


def upgrade() -> None:
    cols = [
        sa.Column("sync_status", sa.String(10), nullable=False, server_default="ok"),
        sa.Column("sync_failures", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("failing_since", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_sync_attempt_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_sync_error", sa.Text(), nullable=True),
        sa.Column("broken_notified_at", sa.DateTime(timezone=True), nullable=True),
    ]
    for col in cols:
        op.add_column("calendar_sources", col, schema="timeiq")


def downgrade() -> None:
    for name in ("broken_notified_at", "last_sync_error", "last_sync_attempt_at", "failing_since", "sync_failures", "sync_status"):
        op.drop_column("calendar_sources", name, schema="timeiq")
