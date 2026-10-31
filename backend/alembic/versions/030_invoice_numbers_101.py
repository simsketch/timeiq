"""Start invoice numbers at 101 for users who haven't invoiced yet.

Revision ID: 030_invoice_numbers_101
Revises: 029_outbound_emails
"""
from alembic import op

revision = "030_invoice_numbers_101"
down_revision = "029_outbound_emails"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column("users", "next_invoice_number", server_default="101", schema="timeiq")
    op.execute(
        "UPDATE timeiq.users u SET next_invoice_number = 101 WHERE next_invoice_number = 1 "
        "AND NOT EXISTS (SELECT 1 FROM timeiq.invoices i WHERE i.user_id = u.id)"
    )


def downgrade() -> None:
    op.alter_column("users", "next_invoice_number", server_default="1", schema="timeiq")
    op.execute(
        "UPDATE timeiq.users u SET next_invoice_number = 1 WHERE next_invoice_number = 101 "
        "AND NOT EXISTS (SELECT 1 FROM timeiq.invoices i WHERE i.user_id = u.id)"
    )
