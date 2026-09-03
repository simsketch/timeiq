"""Add Stripe billing fields to users; grandfather existing users as complimentary

Revision ID: 007_billing
Revises: 006_time_invoices
Create Date: 2026-09-03 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "007_billing"
down_revision: Union[str, None] = "006_time_invoices"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

S = "timeiq"


def upgrade() -> None:
    op.add_column("users", sa.Column("stripe_customer_id", sa.String(255)), schema=S)
    op.add_column("users", sa.Column("stripe_subscription_id", sa.String(255)), schema=S)
    op.add_column(
        "users",
        sa.Column("subscription_status", sa.String(30), nullable=False, server_default="none"),
        schema=S,
    )
    op.add_column("users", sa.Column("subscription_plan", sa.String(20)), schema=S)
    op.add_column(
        "users",
        sa.Column("subscription_current_period_end", sa.DateTime(timezone=True)),
        schema=S,
    )
    op.create_unique_constraint(
        "uq_users_stripe_customer_id", "users", ["stripe_customer_id"], schema=S
    )
    op.create_unique_constraint(
        "uq_users_stripe_subscription_id", "users", ["stripe_subscription_id"], schema=S
    )
    # Everyone who signed up before billing existed keeps access.
    op.execute(f"UPDATE {S}.users SET subscription_status = 'complimentary'")


def downgrade() -> None:
    op.drop_constraint("uq_users_stripe_subscription_id", "users", schema=S, type_="unique")
    op.drop_constraint("uq_users_stripe_customer_id", "users", schema=S, type_="unique")
    op.drop_column("users", "subscription_current_period_end", schema=S)
    op.drop_column("users", "subscription_plan", schema=S)
    op.drop_column("users", "subscription_status", schema=S)
    op.drop_column("users", "stripe_subscription_id", schema=S)
    op.drop_column("users", "stripe_customer_id", schema=S)
