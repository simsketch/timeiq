"""Add clients, time_entries, invoices, invoice_lines and users.next_invoice_number

Revision ID: 006_time_invoices
Revises: 005_feed_token
Create Date: 2026-09-02 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "006_time_invoices"
down_revision: Union[str, None] = "005_feed_token"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

S = "timeiq"


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("next_invoice_number", sa.Integer, nullable=False, server_default="1"),
        schema=S,
    )

    op.create_table(
        "clients",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey(f"{S}.users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("contact_name", sa.String(255)),
        sa.Column("billing_email", sa.String(320)),
        sa.Column("address", sa.Text),
        sa.Column("hourly_rate", sa.Numeric(10, 2), nullable=False),
        sa.Column("currency", sa.String(3), nullable=False, server_default="USD"),
        sa.Column("payment_terms_days", sa.Integer, nullable=False, server_default="30"),
        sa.Column("match_keywords", sa.Text),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        schema=S,
    )
    op.create_index("ix_clients_user_id", "clients", ["user_id"], schema=S)

    op.create_table(
        "invoices",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey(f"{S}.users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "client_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey(f"{S}.clients.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("number", sa.String(20), nullable=False),
        sa.Column("status", sa.String(10), nullable=False, server_default="draft"),
        sa.Column("issue_date", sa.Date, nullable=False),
        sa.Column("due_date", sa.Date, nullable=False),
        sa.Column("period_start", sa.Date, nullable=False),
        sa.Column("period_end", sa.Date, nullable=False),
        sa.Column("currency", sa.String(3), nullable=False),
        sa.Column("hourly_rate", sa.Numeric(10, 2), nullable=False),
        sa.Column("subtotal", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("client_name", sa.String(255), nullable=False),
        sa.Column("client_contact_name", sa.String(255)),
        sa.Column("client_billing_email", sa.String(320)),
        sa.Column("client_address", sa.Text),
        sa.Column("notes", sa.Text),
        sa.Column("public_token", sa.String(64), nullable=False),
        sa.Column("sent_at", sa.DateTime(timezone=True)),
        sa.Column("paid_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("user_id", "number", name="uq_invoices_user_id_number"),
        sa.UniqueConstraint("public_token", name="uq_invoices_public_token"),
        schema=S,
    )
    op.create_index("ix_invoices_user_id", "invoices", ["user_id"], schema=S)
    op.create_index("ix_invoices_client_id", "invoices", ["client_id"], schema=S)

    op.create_table(
        "invoice_lines",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "invoice_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey(f"{S}.invoices.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("time_entry_id", postgresql.UUID(as_uuid=True)),
        sa.Column("line_date", sa.Date, nullable=False),
        sa.Column("description", sa.Text, nullable=False),
        sa.Column("hours", sa.Numeric(6, 2), nullable=False),
        sa.Column("rate", sa.Numeric(10, 2), nullable=False),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        schema=S,
    )
    op.create_index("ix_invoice_lines_invoice_id", "invoice_lines", ["invoice_id"], schema=S)

    op.create_table(
        "time_entries",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey(f"{S}.users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "client_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey(f"{S}.clients.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "invoice_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey(f"{S}.invoices.id", ondelete="SET NULL"),
        ),
        sa.Column("entry_date", sa.Date, nullable=False),
        sa.Column("hours", sa.Numeric(6, 2), nullable=False),
        sa.Column("description", sa.Text, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        schema=S,
    )
    op.create_index("ix_time_entries_user_id", "time_entries", ["user_id"], schema=S)
    op.create_index("ix_time_entries_client_id", "time_entries", ["client_id"], schema=S)
    op.create_index("ix_time_entries_invoice_id", "time_entries", ["invoice_id"], schema=S)
    op.create_index("ix_time_entries_entry_date", "time_entries", ["entry_date"], schema=S)


def downgrade() -> None:
    op.drop_table("time_entries", schema=S)
    op.drop_table("invoice_lines", schema=S)
    op.drop_table("invoices", schema=S)
    op.drop_table("clients", schema=S)
    op.drop_column("users", "next_invoice_number", schema=S)
