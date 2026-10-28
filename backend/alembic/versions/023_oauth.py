"""OAuth for MCP connectors

Revision ID: 023_oauth
Revises: 022_api_tokens
Create Date: 2026-10-28
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "023_oauth"
down_revision = "022_api_tokens"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "oauth_clients",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("redirect_uris", postgresql.JSONB(), nullable=False),
        sa.Column("registration_ip_hash", sa.String(64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        schema="timeiq",
    )
    op.create_index("ix_timeiq_oauth_clients_registration_ip_hash", "oauth_clients", ["registration_ip_hash"], schema="timeiq")
    op.create_index("ix_timeiq_oauth_clients_created_at", "oauth_clients", ["created_at"], schema="timeiq")
    op.create_table(
        "oauth_grants",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("client_id", sa.String(64), sa.ForeignKey("timeiq.oauth_clients.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("timeiq.users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("resource", sa.String(2048), nullable=False),
        sa.Column("scope", sa.String(100), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        schema="timeiq",
    )
    op.create_index("ix_timeiq_oauth_grants_user_id", "oauth_grants", ["user_id"], schema="timeiq")
    op.create_table(
        "oauth_authorization_codes",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("request_hash", sa.String(64), nullable=False, unique=True),
        sa.Column("code_hash", sa.String(64), nullable=True, unique=True),
        sa.Column("client_id", sa.String(64), sa.ForeignKey("timeiq.oauth_clients.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("timeiq.users.id", ondelete="CASCADE"), nullable=True),
        sa.Column("grant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("timeiq.oauth_grants.id", ondelete="CASCADE"), nullable=True),
        sa.Column("redirect_uri", sa.String(2048), nullable=False),
        sa.Column("code_challenge", sa.String(43), nullable=False),
        sa.Column("resource", sa.String(2048), nullable=False),
        sa.Column("scope", sa.String(100), nullable=False),
        sa.Column("state", sa.String(2048), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("decided_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("consumed_at", sa.DateTime(timezone=True), nullable=True),
        schema="timeiq",
    )
    op.create_index("ix_timeiq_oauth_authorization_codes_client_id", "oauth_authorization_codes", ["client_id"], schema="timeiq")
    for table in ("oauth_access_tokens", "oauth_refresh_tokens"):
        columns = [
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column("grant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("timeiq.oauth_grants.id", ondelete="CASCADE"), nullable=False),
            sa.Column("token_hash", sa.String(64), nullable=False, unique=True),
            sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        ]
        if table == "oauth_refresh_tokens":
            columns.append(sa.Column("consumed_at", sa.DateTime(timezone=True), nullable=True))
        op.create_table(table, *columns, schema="timeiq")
        op.create_index(f"ix_timeiq_{table}_grant_id", table, ["grant_id"], schema="timeiq")


def downgrade() -> None:
    for table in ("oauth_refresh_tokens", "oauth_access_tokens", "oauth_authorization_codes", "oauth_grants", "oauth_clients"):
        op.drop_table(table, schema="timeiq")
