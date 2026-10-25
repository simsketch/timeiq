"""Keep booking history when an event type goes away, and track calendar invite identity

- event_types.archived_at: an event type with bookings is archived instead of deleted.
- bookings.event_type_id no longer cascades on delete (NO ACTION), so a hard
  delete can never take bookings with it. Deleting a user still works because
  the users -> bookings cascade removes the bookings in the same statement.
- bookings.ical_uid / ical_sequence: one calendar UID per booking chain, with a
  SEQUENCE that increases on every reschedule or cancellation.

Revision ID: 012_booking_history_ical
Revises: 011_calendar_health
Create Date: 2026-10-25

"""
from alembic import op
import sqlalchemy as sa

revision = "012_booking_history_ical"
down_revision = "011_calendar_health"
branch_labels = None
depends_on = None

FK_NAME = "fk_bookings_event_type_id_event_types"


def _event_type_fk_names() -> list[str]:
    insp = sa.inspect(op.get_bind())
    return [
        fk["name"]
        for fk in insp.get_foreign_keys("bookings", schema="timeiq")
        if fk["referred_table"] == "event_types" and fk["constrained_columns"] == ["event_type_id"]
    ]


def _replace_fk(ondelete: str | None) -> None:
    for name in _event_type_fk_names():
        op.drop_constraint(name, "bookings", schema="timeiq", type_="foreignkey")
    op.create_foreign_key(
        FK_NAME,
        "bookings",
        "event_types",
        ["event_type_id"],
        ["id"],
        source_schema="timeiq",
        referent_schema="timeiq",
        ondelete=ondelete,
    )


def upgrade() -> None:
    op.add_column(
        "event_types",
        sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True),
        schema="timeiq",
    )
    op.add_column(
        "bookings",
        sa.Column("ical_uid", sa.String(255), nullable=True),
        schema="timeiq",
    )
    op.add_column(
        "bookings",
        sa.Column("ical_sequence", sa.Integer(), nullable=False, server_default="0"),
        schema="timeiq",
    )
    _replace_fk(None)


def downgrade() -> None:
    _replace_fk("CASCADE")
    op.drop_column("bookings", "ical_sequence", schema="timeiq")
    op.drop_column("bookings", "ical_uid", schema="timeiq")
    op.drop_column("event_types", "archived_at", schema="timeiq")
