"""Custom booking-page logo and optional white labeling."""
import sqlalchemy as sa
from alembic import op

revision = "035_booking_branding"
down_revision = "034_calendar_handoffs"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("booking_logo", sa.Text(), nullable=True), schema="timeiq")
    op.add_column("users", sa.Column("booking_white_label", sa.Boolean(), nullable=False, server_default=sa.false()), schema="timeiq")


def downgrade() -> None:
    op.drop_column("users", "booking_white_label", schema="timeiq")
    op.drop_column("users", "booking_logo", schema="timeiq")
