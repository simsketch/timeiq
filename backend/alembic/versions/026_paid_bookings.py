"""Stripe Connect and paid booking holds.

Revision ID: 026_paid_bookings
Revises: 025_booking_extras
"""
from alembic import op
import sqlalchemy as sa

revision = "026_paid_bookings"
down_revision = "025_booking_extras"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("stripe_connect_account_id", sa.String(255), nullable=True), schema="timeiq")
    op.create_unique_constraint("uq_users_stripe_connect_account_id", "users", ["stripe_connect_account_id"], schema="timeiq")
    for name in ("stripe_connect_charges_enabled", "stripe_connect_payouts_enabled"):
        op.add_column("users", sa.Column(name, sa.Boolean(), nullable=False, server_default=sa.false()), schema="timeiq")
    for table in ("event_types", "bookings"):
        op.add_column(table, sa.Column("price_cents", sa.Integer(), nullable=True), schema="timeiq")
        op.add_column(table, sa.Column("currency", sa.String(3), nullable=False, server_default="usd"), schema="timeiq")
        op.create_check_constraint(op.f(f"ck_{table}_positive_price"), table, "price_cents IS NULL OR price_cents > 0", schema="timeiq")
    for name in ("stripe_connect_account_id", "stripe_checkout_session_id", "stripe_payment_intent_id", "stripe_refund_id"):
        op.add_column("bookings", sa.Column(name, sa.String(255), nullable=True), schema="timeiq")
    op.add_column("bookings", sa.Column("refund_status", sa.String(30), nullable=True), schema="timeiq")
    op.add_column("bookings", sa.Column("payment_expires_at", sa.DateTime(timezone=True), nullable=True), schema="timeiq")
    op.add_column("bookings", sa.Column("payment_token", sa.String(64), nullable=True), schema="timeiq")
    op.add_column("bookings", sa.Column("checkout_url", sa.Text(), nullable=True), schema="timeiq")
    op.create_index("ix_timeiq_bookings_payment_expires_at", "bookings", ["payment_expires_at"], schema="timeiq")
    for name in ("stripe_checkout_session_id", "payment_token"):
        op.create_unique_constraint(f"uq_bookings_{name}", "bookings", [name], schema="timeiq")


def downgrade() -> None:
    for name in ("stripe_checkout_session_id", "payment_token"):
        op.drop_constraint(f"uq_bookings_{name}", "bookings", schema="timeiq", type_="unique")
    op.drop_index("ix_timeiq_bookings_payment_expires_at", table_name="bookings", schema="timeiq")
    for name in ("checkout_url", "payment_token", "payment_expires_at", "refund_status", "stripe_refund_id", "stripe_payment_intent_id", "stripe_checkout_session_id", "stripe_connect_account_id"):
        op.drop_column("bookings", name, schema="timeiq")
    for table in ("event_types", "bookings"):
        op.drop_constraint(op.f(f"ck_{table}_positive_price"), table, schema="timeiq", type_="check")
        op.drop_column(table, "currency", schema="timeiq")
        op.drop_column(table, "price_cents", schema="timeiq")
    op.drop_constraint("uq_users_stripe_connect_account_id", "users", schema="timeiq", type_="unique")
    for name in ("stripe_connect_payouts_enabled", "stripe_connect_charges_enabled", "stripe_connect_account_id"):
        op.drop_column("users", name, schema="timeiq")
