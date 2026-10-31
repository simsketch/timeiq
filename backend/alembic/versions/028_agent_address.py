"""Shared agent address and verified sender addresses.

Revision ID: 028_agent_address
Revises: 027_agent_summary
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "028_agent_address"
down_revision = "027_agent_summary"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "user_email_aliases",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("timeiq.users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("email", sa.String(320), nullable=False, unique=True),
        sa.Column("verify_token_hash", sa.String(64), nullable=True, unique=True),
        sa.Column("verification_sent_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("verified_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("email = lower(email)", name="lowercase"),
        schema="timeiq",
    )
    op.create_index("ix_timeiq_user_email_aliases_user_id", "user_email_aliases", ["user_id"], schema="timeiq")
    op.create_table(
        "email_address_notices",
        sa.Column("key", sa.String(340), primary_key=True),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=False),
        schema="timeiq",
    )
    # A shared-address delivery claims its Resend id before its owner is known.
    op.alter_column("email_imports", "user_id", nullable=True, schema="timeiq")
    op.add_column("email_imports", sa.Column("inbound_address", sa.String(320), nullable=True), schema="timeiq")
    op.add_column("group_meetings", sa.Column("inbound_address", sa.String(320), nullable=True), schema="timeiq")


def downgrade() -> None:
    op.drop_column("group_meetings", "inbound_address", schema="timeiq")
    op.drop_column("email_imports", "inbound_address", schema="timeiq")
    op.execute("DELETE FROM timeiq.email_imports WHERE user_id IS NULL")
    op.alter_column("email_imports", "user_id", nullable=False, schema="timeiq")
    op.drop_table("email_address_notices", schema="timeiq")
    op.drop_table("user_email_aliases", schema="timeiq")
