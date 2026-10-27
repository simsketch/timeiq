"""cc TimeIQ: group meetings started from an email thread

Revision ID: 017_meeting_agent
Revises: 016_group_meetings
Create Date: 2026-10-27

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "017_meeting_agent"
down_revision = "016_group_meetings"
branch_labels = None
depends_on = None


def upgrade() -> None:
    cols = [
        sa.Column("source", sa.String(20), nullable=False, server_default="app"),
        sa.Column("earliest_minute", sa.Integer, nullable=True),
        sa.Column("latest_minute", sa.Integer, nullable=True),
        sa.Column("weekdays", postgresql.JSONB, nullable=True),
        sa.Column("thread_ids", postgresql.JSONB, nullable=False, server_default="[]"),
        sa.Column("thread_subject", sa.String(500), nullable=True),
    ]
    for c in cols:
        op.add_column("group_meetings", c, schema="timeiq")


def downgrade() -> None:
    for name in ("thread_subject", "thread_ids", "weekdays", "latest_minute", "earliest_minute", "source"):
        op.drop_column("group_meetings", name, schema="timeiq")
