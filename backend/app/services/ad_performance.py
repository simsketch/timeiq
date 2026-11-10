"""Read Meta reporting only; no campaign or budget mutations."""
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo
import re

import httpx

from app.config import settings

API = "https://graph.facebook.com/v21.0"
# TimeIQ Founder 100, managed by scripts/meta_ads.py; the account also runs other products.
CAMPAIGN_ID = "120251255611590756"


def action(row, name):
    return int(float(next((a["value"] for a in row.get("actions", []) if a["action_type"] == name), 0)))


async def fetch_report(days: int):
    account = settings.META_AD_ACCOUNT_ID
    if not settings.META_ACCESS_TOKEN or not re.fullmatch(r"act_\d+", account):
        raise ValueError("Ad reporting is not connected on the server yet.")
    async with httpx.AsyncClient(timeout=20, headers={"Authorization": f"Bearer {settings.META_ACCESS_TOKEN}"}) as client:
        async def get(path, params):
            response = await client.get(f"{API}/{path}", params=params)
            response.raise_for_status()
            return response.json()

        info = await get(account, {"fields": "currency,timezone_name"})
        today = datetime.now(ZoneInfo(info["timezone_name"])).date()
        params = {
            "level": "ad", "limit": 100,
            "fields": "ad_id,ad_name,campaign_id,campaign_name,spend,impressions,inline_link_clicks,actions,date_start,date_stop",
        }
        if days:
            import json
            params["time_range"] = json.dumps({"since": str(today - timedelta(days=days)), "until": str(today - timedelta(days=1))})
        else:
            params["date_preset"] = "maximum"
        rows = []
        # Page using cursors on the same trusted endpoint; never follow upstream URLs with a token.
        for _ in range(50):
            page = await get(f"{CAMPAIGN_ID}/insights", params)
            rows.extend(page.get("data", []))
            if not page.get("paging", {}).get("next"):
                break
            params["after"] = page["paging"]["cursors"]["after"]
        else:
            raise ValueError("The ad report is too large to display. Choose a shorter period.")
    ads = [{
        "id": r["ad_id"], "name": r["ad_name"], "campaign": r["campaign_name"],
        "spend": float(r.get("spend", 0)), "impressions": int(r.get("impressions", 0)),
        "link_clicks": int(r.get("inline_link_clicks", 0)),
        "landing_page_views": action(r, "landing_page_view"),
        "meta_registrations": action(r, "complete_registration"), "purchases": action(r, "purchase"),
    } for r in rows]
    since = str(today - timedelta(days=days)) if days else min((r["date_start"] for r in rows), default=str(today))
    until = str(today - timedelta(days=1)) if days else str(today)
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(), "currency": info["currency"],
        "timezone": info["timezone_name"], "since": since, "until": until, "ads": ads,
        "totals": {key: round(sum(r[key] for r in ads), 2) for key in (
            "spend", "impressions", "link_clicks", "landing_page_views", "meta_registrations", "purchases"
        )},
    }
