"""Email a schedule in: inbound addresses, imports, and event tagging

Revision ID: 015_email_imports
Revises: 014_guest_checkouts
Create Date: 2026-10-27

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "015_email_imports"
down_revision = "014_guest_checkouts"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("inbound_token", sa.String(32), nullable=True), schema="timeiq")
    op.create_unique_constraint("uq_users_inbound_token", "users", ["inbound_token"], schema="timeiq")
    op.create_table(
        "email_imports",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("timeiq.users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("resend_email_id", sa.String(255), nullable=False, unique=True),
        sa.Column("sender", sa.String(320), nullable=True),
        sa.Column("subject", sa.String(500), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="processing"),
        sa.Column("event_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column("error", sa.Text, nullable=True),
        sa.Column("undo_token", sa.String(64), nullable=False, unique=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("undone_at", sa.DateTime(timezone=True), nullable=True),
        schema="timeiq",
    )
    op.create_index("ix_email_imports_user_id", "email_imports", ["user_id"], schema="timeiq")
    op.add_column(
        "cached_events",
        sa.Column(
            "email_import_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("timeiq.email_imports.id", ondelete="CASCADE"),
            nullable=True,
        ),
        schema="timeiq",
    )
    op.create_index("ix_cached_events_email_import_id", "cached_events", ["email_import_id"], schema="timeiq")


def downgrade() -> None:
    op.drop_index("ix_cached_events_email_import_id", table_name="cached_events", schema="timeiq")
    op.drop_column("cached_events", "email_import_id", schema="timeiq")
    op.drop_index("ix_email_imports_user_id", table_name="email_imports", schema="timeiq")
    op.drop_table("email_imports", schema="timeiq")
    op.drop_constraint("uq_users_inbound_token", "users", schema="timeiq", type_="unique")
    op.drop_column("users", "inbound_token", schema="timeiq")
