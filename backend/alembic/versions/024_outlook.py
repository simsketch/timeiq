"""Microsoft calendar credentials

Revision ID: 024_outlook
Revises: 023_oauth
Create Date: 2026-10-28

"""
from alembic import op
import sqlalchemy as sa

revision = "024_outlook"
down_revision = "023_oauth"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("calendar_sources", sa.Column("microsoft_access_token", sa.Text(), nullable=True), schema="timeiq")
    op.add_column("calendar_sources", sa.Column("microsoft_refresh_token", sa.Text(), nullable=True), schema="timeiq")
    op.add_column("calendar_sources", sa.Column("microsoft_token_expires_at", sa.DateTime(timezone=True), nullable=True), schema="timeiq")
    op.add_column("calendar_sources", sa.Column("microsoft_account_id", sa.String(255), nullable=True), schema="timeiq")


def downgrade() -> None:
    op.drop_column("calendar_sources", "microsoft_account_id", schema="timeiq")
    op.drop_column("calendar_sources", "microsoft_token_expires_at", schema="timeiq")
    op.drop_column("calendar_sources", "microsoft_refresh_token", schema="timeiq")
    op.drop_column("calendar_sources", "microsoft_access_token", schema="timeiq")
