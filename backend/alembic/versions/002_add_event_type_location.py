"""Add location column to event_types

Revision ID: 002_add_event_type_location
Revises: 001_initial
Create Date: 2026-02-11 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "002_add_event_type_location"
down_revision: Union[str, None] = "001_initial"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "event_types",
        sa.Column("location", sa.Text, nullable=True),
        schema="timeiq",
    )


def downgrade() -> None:
    op.drop_column("event_types", "location", schema="timeiq")
