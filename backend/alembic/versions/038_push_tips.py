"""Push tips: opt-in feature tips for free and trial accounts.

Revision ID: 038_push_tips
Revises: 037_assistant_turns
"""
import sqlalchemy as sa
from alembic import op

revision = "038_push_tips"
down_revision = "037_assistant_turns"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("push_tips_step", sa.Integer(), nullable=False, server_default="0"), schema="timeiq")
    op.add_column("users", sa.Column("push_tips_opt_in", sa.Boolean(), nullable=False, server_default=sa.false()), schema="timeiq")
    op.add_column("users", sa.Column("push_tips_asked_at", sa.DateTime(timezone=True), nullable=True), schema="timeiq")
    # Last tip sent, for the one-a-day limit.
    op.add_column("users", sa.Column("push_tips_sent_at", sa.DateTime(timezone=True), nullable=True), schema="timeiq")


def downgrade() -> None:
    for name in ("push_tips_sent_at", "push_tips_asked_at", "push_tips_opt_in", "push_tips_step"):
        op.drop_column("users", name, schema="timeiq")
