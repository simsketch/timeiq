"""Add feed_token and feed_obfuscate to users

Revision ID: 005_feed_token
Revises: 004_reason_to_url
Create Date: 2026-04-16 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "005_feed_token"
down_revision: Union[str, None] = "004_reason_to_url"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("feed_token", sa.String(64), nullable=True),
        schema="timeiq",
    )
    op.add_column(
        "users",
        sa.Column(
            "feed_obfuscate",
            sa.Boolean,
            nullable=False,
            server_default="false",
        ),
        schema="timeiq",
    )
    op.create_unique_constraint(
        "uq_users_feed_token",
        "users",
        ["feed_token"],
        schema="timeiq",
    )


def downgrade() -> None:
    op.drop_constraint("uq_users_feed_token", "users", schema="timeiq", type_="unique")
    op.drop_column("users", "feed_obfuscate", schema="timeiq")
    op.drop_column("users", "feed_token", schema="timeiq")
