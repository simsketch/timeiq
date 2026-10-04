"""Per-invoice toggle for the weekly hours summary

Revision ID: 010_weekly_toggle
Revises: 009_invoice_expenses
Create Date: 2026-10-04

"""
from alembic import op
import sqlalchemy as sa

revision = "010_weekly_toggle"
down_revision = "009_expense_lines"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "invoices",
        sa.Column(
            "show_weekly_breakdown",
            sa.Boolean(),
            nullable=False,
            server_default="true",
        ),
        schema="timeiq",
    )


def downgrade() -> None:
    op.drop_column("invoices", "show_weekly_breakdown", schema="timeiq")
