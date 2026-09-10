"""Saved timesheet rows, weekly hours target, monthly auto-invoice flag

Revision ID: 008_rows_targets
Revises: 007_billing
Create Date: 2026-09-10 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "008_rows_targets"
down_revision: Union[str, None] = "007_billing"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

S = "timeiq"


def upgrade() -> None:
    op.add_column("users", sa.Column("weekly_hours_target", sa.Integer, nullable=False, server_default="40"), schema=S)
    op.add_column("clients", sa.Column("auto_invoice_monthly", sa.Boolean, nullable=False, server_default="false"), schema=S)
    op.create_table(
        "timesheet_rows",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey(f"{S}.users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("client_id", postgresql.UUID(as_uuid=True), sa.ForeignKey(f"{S}.clients.id", ondelete="CASCADE"), nullable=False),
        sa.Column("description", sa.Text, nullable=False),
        sa.Column("sort_order", sa.Integer, nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("user_id", "client_id", "description", name="uq_timesheet_rows_user_client_desc"),
        schema=S,
    )
    op.create_index("ix_timesheet_rows_user_id", "timesheet_rows", ["user_id"], schema=S)
    op.create_index("ix_timesheet_rows_client_id", "timesheet_rows", ["client_id"], schema=S)


def downgrade() -> None:
    op.drop_table("timesheet_rows", schema=S)
    op.drop_column("clients", "auto_invoice_monthly", schema=S)
    op.drop_column("users", "weekly_hours_target", schema=S)
