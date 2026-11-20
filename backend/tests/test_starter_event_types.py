import os
import re
import uuid

import pytest
from sqlalchemy import delete, select

from app.auth import get_current_user_clerk_id
from app.database import async_session
from app.main import app
from app.models.event_type import EventType
from app.models.user import User
from tests.test_admin import clerk
from tests.test_qa_db_races import env  # noqa: F401

pytestmark = pytest.mark.skipif(
    not re.search(r"@(localhost|127\.0\.0\.1)(:\d+)?/", os.environ.get("DATABASE_URL", "")),
    reason="needs a local Postgres in DATABASE_URL",
)


@pytest.mark.asyncio
async def test_new_account_gets_30_minute_and_1_hour_meetings_once(env, monkeypatch):
    clerk_id = f"starter_{uuid.uuid4().hex[:10]}"
    clerk(monkeypatch, email=f"{clerk_id}@example.com")
    app.dependency_overrides[get_current_user_clerk_id] = lambda: clerk_id
    try:
        for _ in range(2):  # a second sync (existing account) adds nothing
            r = await env.client.post("/api/me/sync")
            assert r.status_code == 200, r.text
        async with async_session() as db:
            user = (await db.execute(select(User).where(User.clerk_id == clerk_id))).scalar_one()
            types = (await db.execute(select(EventType).where(EventType.user_id == user.id))).scalars().all()
            assert sorted((t.duration_minutes, t.slug, t.is_active) for t in types) == [
                (30, "30-minute-meeting", True), (60, "1-hour-meeting", True),
            ]
            await db.execute(delete(User).where(User.id == user.id))
            await db.commit()
    finally:
        app.dependency_overrides.clear()
