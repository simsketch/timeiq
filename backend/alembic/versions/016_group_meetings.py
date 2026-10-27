"""Group meetings: find a time with several people

Revision ID: 016_group_meetings
Revises: 015_email_imports
Create Date: 2026-10-27

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "016_group_meetings"
down_revision = "015_email_imports"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "group_meetings",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("organizer_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("timeiq.users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("note", sa.Text, nullable=True),
        sa.Column("location", sa.String(500), nullable=True),
        sa.Column("duration_minutes", sa.Integer, nullable=False),
        sa.Column("window_start", sa.Date, nullable=False),
        sa.Column("window_end", sa.Date, nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="open"),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ends_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ical_sequence", sa.Integer, nullable=False, server_default="0"),
        sa.Column("all_answered_notified_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        schema="timeiq",
    )
    op.create_index("ix_group_meetings_organizer_id", "group_meetings", ["organizer_id"], schema="timeiq")
    op.create_table(
        "group_meeting_participants",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("meeting_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("timeiq.group_meetings.id", ondelete="CASCADE"), nullable=False),
        sa.Column("email", sa.String(320), nullable=False),
        sa.Column("name", sa.String(255), nullable=True),
        sa.Column("token", sa.String(64), nullable=False, unique=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("timeiq.users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("uses_calendar", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("available_starts", postgresql.JSONB, nullable=False, server_default="[]"),
        sa.Column("responded_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        schema="timeiq",
    )
    op.create_index("ix_group_meeting_participants_meeting_id", "group_meeting_participants", ["meeting_id"], schema="timeiq")
    op.create_index("ix_group_meeting_participants_user_id", "group_meeting_participants", ["user_id"], schema="timeiq")
    # Booked meetings live as events on each TimeIQ calendar involved; tag them
    # so cancelling removes exactly those.
    op.add_column(
        "cached_events",
        sa.Column("group_meeting_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("timeiq.group_meetings.id", ondelete="CASCADE"), nullable=True),
        schema="timeiq",
    )
    op.create_index("ix_cached_events_group_meeting_id", "cached_events", ["group_meeting_id"], schema="timeiq")


def downgrade() -> None:
    op.drop_index("ix_cached_events_group_meeting_id", table_name="cached_events", schema="timeiq")
    op.drop_column("cached_events", "group_meeting_id", schema="timeiq")
    op.drop_table("group_meeting_participants", schema="timeiq")
    op.drop_table("group_meetings", schema="timeiq")
