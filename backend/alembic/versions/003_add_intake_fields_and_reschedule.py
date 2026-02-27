"""Add intake fields to event_types/bookings and reschedule support

Revision ID: 003_intake_resched
Revises: 002_add_event_type_location
Create Date: 2026-02-27 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "003_intake_resched"
down_revision: Union[str, None] = "002_add_event_type_location"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Event type intake field toggles
    op.add_column(
        "event_types",
        sa.Column("collect_phone", sa.Boolean, nullable=False, server_default="false"),
        schema="timeiq",
    )
    op.add_column(
        "event_types",
        sa.Column("collect_company", sa.Boolean, nullable=False, server_default="false"),
        schema="timeiq",
    )
    op.add_column(
        "event_types",
        sa.Column("collect_reason", sa.Boolean, nullable=False, server_default="false"),
        schema="timeiq",
    )

    # Booking visitor intake data
    op.add_column(
        "bookings",
        sa.Column("visitor_phone", sa.String(50), nullable=True),
        schema="timeiq",
    )
    op.add_column(
        "bookings",
        sa.Column("visitor_company", sa.String(255), nullable=True),
        schema="timeiq",
    )
    op.add_column(
        "bookings",
        sa.Column("visitor_reason", sa.Text, nullable=True),
        schema="timeiq",
    )

    # Rescheduled-from reference
    op.add_column(
        "bookings",
        sa.Column("rescheduled_from_id", UUID(as_uuid=True), nullable=True),
        schema="timeiq",
    )


def downgrade() -> None:
    op.drop_column("bookings", "rescheduled_from_id", schema="timeiq")
    op.drop_column("bookings", "visitor_reason", schema="timeiq")
    op.drop_column("bookings", "visitor_company", schema="timeiq")
    op.drop_column("bookings", "visitor_phone", schema="timeiq")
    op.drop_column("event_types", "collect_reason", schema="timeiq")
    op.drop_column("event_types", "collect_company", schema="timeiq")
    op.drop_column("event_types", "collect_phone", schema="timeiq")
