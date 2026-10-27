"""Let people pay before creating an account

Revision ID: 014_guest_checkouts
Revises: 013_founder_seat_hold
Create Date: 2026-10-26

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "014_guest_checkouts"
down_revision = "013_founder_seat_hold"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "guest_checkouts",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("stripe_session_id", sa.String(255), nullable=True, unique=True),
        sa.Column("plan", sa.String(20), nullable=False),
        sa.Column("reserved_until", sa.DateTime(timezone=True), nullable=True),
        sa.Column("email", sa.String(320), nullable=True),
        sa.Column("stripe_customer_id", sa.String(255), nullable=True),
        sa.Column("stripe_subscription_id", sa.String(255), nullable=True),
        sa.Column("subscription_status", sa.String(30), nullable=False, server_default="none"),
        sa.Column(
            "claimed_by_user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("timeiq.users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("claimed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        schema="timeiq",
    )
    op.create_index("ix_guest_checkouts_email", "guest_checkouts", ["email"], schema="timeiq")
    op.create_index(
        "ix_guest_checkouts_stripe_customer_id", "guest_checkouts", ["stripe_customer_id"], schema="timeiq"
    )


def downgrade() -> None:
    op.drop_index("ix_guest_checkouts_stripe_customer_id", table_name="guest_checkouts", schema="timeiq")
    op.drop_index("ix_guest_checkouts_email", table_name="guest_checkouts", schema="timeiq")
    op.drop_table("guest_checkouts", schema="timeiq")
