"""Keep what was asked and answered on each assistant turn, for the admin chat log.

Revision ID: 039_assistant_transcripts
Revises: 038_push_tips
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision = "039_assistant_transcripts"
down_revision = "038_push_tips"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("assistant_turns", sa.Column("prompt", sa.Text(), nullable=True), schema="timeiq")
    op.add_column("assistant_turns", sa.Column("reply", sa.Text(), nullable=True), schema="timeiq")
    op.add_column("assistant_turns", sa.Column("transcript", JSONB(), nullable=True), schema="timeiq")
    op.create_index("ix_assistant_turns_created_at", "assistant_turns", ["created_at"], schema="timeiq")


def downgrade() -> None:
    op.drop_index("ix_assistant_turns_created_at", "assistant_turns", schema="timeiq")
    for name in ("transcript", "reply", "prompt"):
        op.drop_column("assistant_turns", name, schema="timeiq")
