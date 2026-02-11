"""Initial migration - create all tables

Revision ID: 001_initial
Revises:
Create Date: 2026-02-10 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "001_initial"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create the timeiq schema
    op.execute("CREATE SCHEMA IF NOT EXISTS timeiq")

    # Create users table
    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("clerk_id", sa.String(255), unique=True, nullable=False, index=True),
        sa.Column("email", sa.String(320), nullable=False),
        sa.Column("name", sa.String(255), nullable=True),
        sa.Column("username", sa.String(100), unique=True, nullable=False, index=True),
        sa.Column(
            "timezone",
            sa.String(100),
            nullable=False,
            server_default="America/New_York",
        ),
        sa.Column("image_url", sa.Text, nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        schema="timeiq",
    )

    # Create calendar_sources table
    op.create_table(
        "calendar_sources",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("timeiq.users.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("type", sa.String(20), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("google_access_token", sa.Text, nullable=True),
        sa.Column("google_refresh_token", sa.Text, nullable=True),
        sa.Column(
            "google_token_expires_at", sa.DateTime(timezone=True), nullable=True
        ),
        sa.Column("google_calendar_id", sa.String(255), nullable=True),
        sa.Column("ics_url", sa.Text, nullable=True),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("last_synced_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        schema="timeiq",
    )

    # Create cached_events table
    op.create_table(
        "cached_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "calendar_source_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("timeiq.calendar_sources.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("timeiq.users.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("title", sa.String(500), nullable=True),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ends_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("is_all_day", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("external_id", sa.String(500), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        schema="timeiq",
    )

    # Create event_types table
    op.create_table(
        "event_types",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("timeiq.users.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("slug", sa.String(200), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("duration_minutes", sa.Integer, nullable=False),
        sa.Column("color", sa.String(20), nullable=False, server_default="#3B82F6"),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("buffer_minutes", sa.Integer, nullable=False, server_default="0"),
        sa.Column("max_bookings_per_day", sa.Integer, nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.UniqueConstraint("user_id", "slug", name="uq_event_types_user_id_slug"),
        schema="timeiq",
    )

    # Create availability_rules table
    op.create_table(
        "availability_rules",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("timeiq.users.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("day_of_week", sa.SmallInteger, nullable=False),
        sa.Column("start_time", sa.Time, nullable=False),
        sa.Column("end_time", sa.Time, nullable=False),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default="true"),
        sa.UniqueConstraint(
            "user_id",
            "day_of_week",
            name="uq_availability_rules_user_id_day_of_week",
        ),
        schema="timeiq",
    )

    # Create bookings table
    op.create_table(
        "bookings",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "event_type_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("timeiq.event_types.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "host_user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("timeiq.users.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("visitor_name", sa.String(255), nullable=False),
        sa.Column("visitor_email", sa.String(320), nullable=False),
        sa.Column("visitor_notes", sa.Text, nullable=True),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ends_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("timezone", sa.String(100), nullable=False),
        sa.Column(
            "status", sa.String(20), nullable=False, server_default="confirmed"
        ),
        sa.Column("cancel_token", sa.String(255), unique=True, nullable=True),
        sa.Column("cancelled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        schema="timeiq",
    )


def downgrade() -> None:
    op.drop_table("bookings", schema="timeiq")
    op.drop_table("availability_rules", schema="timeiq")
    op.drop_table("event_types", schema="timeiq")
    op.drop_table("cached_events", schema="timeiq")
    op.drop_table("calendar_sources", schema="timeiq")
    op.drop_table("users", schema="timeiq")
    op.execute("DROP SCHEMA IF EXISTS timeiq CASCADE")
