"""cc TimeIQ hardening: remember the times offered, claim each inbound Message-ID once

Revision ID: 019_agent_hardening
Revises: 017_meeting_agent
Create Date: 2026-10-27

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "019_agent_hardening"
down_revision = "017_meeting_agent"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # The exact starts TimeIQ offered on the thread, in order (null on older meetings).
    op.add_column("group_meetings", sa.Column("offered_starts", postgresql.JSONB, nullable=True), schema="timeiq")
    op.add_column("group_meeting_participants", sa.Column("offered_starts", postgresql.JSONB, nullable=True), schema="timeiq")
    op.create_table(
        "agent_message_claims",
        sa.Column("message_id", sa.String(500), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("timeiq.users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        schema="timeiq",
    )
    op.create_index("ix_agent_message_claims_user_id", "agent_message_claims", ["user_id"], schema="timeiq")


def downgrade() -> None:
    op.drop_index("ix_agent_message_claims_user_id", table_name="agent_message_claims", schema="timeiq")
    op.drop_table("agent_message_claims", schema="timeiq")
    op.drop_column("group_meeting_participants", "offered_starts", schema="timeiq")
    op.drop_column("group_meetings", "offered_starts", schema="timeiq")
