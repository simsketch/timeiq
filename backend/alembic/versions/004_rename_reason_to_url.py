"""Rename reason to url, add require_ fields

Revision ID: 004_reason_to_url
Revises: 003_intake_resched
Create Date: 2026-02-27 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "004_reason_to_url"
down_revision: Union[str, None] = "003_intake_resched"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Rename reason -> url
    op.alter_column(
        "event_types",
        "collect_reason",
        new_column_name="collect_url",
        schema="timeiq",
    )
    op.alter_column(
        "bookings",
        "visitor_reason",
        new_column_name="visitor_url",
        type_=sa.String(500),
        schema="timeiq",
    )

    # Add require_ toggles
    op.add_column(
        "event_types",
        sa.Column("require_phone", sa.Boolean, nullable=False, server_default="false"),
        schema="timeiq",
    )
    op.add_column(
        "event_types",
        sa.Column("require_company", sa.Boolean, nullable=False, server_default="false"),
        schema="timeiq",
    )
    op.add_column(
        "event_types",
        sa.Column("require_url", sa.Boolean, nullable=False, server_default="false"),
        schema="timeiq",
    )


def downgrade() -> None:
    op.drop_column("event_types", "require_url", schema="timeiq")
    op.drop_column("event_types", "require_company", schema="timeiq")
    op.drop_column("event_types", "require_phone", schema="timeiq")
    op.alter_column(
        "bookings",
        "visitor_url",
        new_column_name="visitor_reason",
        type_=sa.Text,
        schema="timeiq",
    )
    op.alter_column(
        "event_types",
        "collect_url",
        new_column_name="collect_reason",
        schema="timeiq",
    )
