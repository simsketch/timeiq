"""Allow expense lines on invoices: kind column, nullable hours/rate

Revision ID: 009_expense_lines
Revises: 008_rows_targets
Create Date: 2026-10-04 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "009_expense_lines"
down_revision: Union[str, None] = "008_rows_targets"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

S = "timeiq"


def upgrade() -> None:
    op.add_column(
        "invoice_lines",
        sa.Column("kind", sa.String(10), nullable=False, server_default="time"),
        schema=S,
    )
    # Expense lines have no hours or rate.
    op.alter_column("invoice_lines", "hours", nullable=True, schema=S)
    op.alter_column("invoice_lines", "rate", nullable=True, schema=S)


def downgrade() -> None:
    op.execute(f"UPDATE {S}.invoice_lines SET hours = 0 WHERE hours IS NULL")
    op.execute(f"UPDATE {S}.invoice_lines SET rate = 0 WHERE rate IS NULL")
    op.execute(f"DELETE FROM {S}.invoice_lines WHERE kind = 'expense'")
    op.alter_column("invoice_lines", "rate", nullable=False, schema=S)
    op.alter_column("invoice_lines", "hours", nullable=False, schema=S)
    op.drop_column("invoice_lines", "kind", schema=S)
