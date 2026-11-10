"""First recorded marketing source for new accounts."""
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from alembic import op

revision = "036_signup_attribution"
down_revision = "035_booking_branding"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("users", sa.Column("signup_attribution", postgresql.JSONB(), nullable=True), schema="timeiq")


def downgrade():
    op.drop_column("users", "signup_attribution", schema="timeiq")
