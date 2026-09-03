"""Meta Marketing API helper for the TimeIQ founder campaign.

Reads from backend/.env.local (via app.config's dotenv loading):
    META_ACCESS_TOKEN   system-user token with ads_management, ads_read
    META_AD_ACCOUNT_ID  e.g. act_1234567890
    META_PAGE_ID        the Facebook Page the ads run from
    META_PIXEL_ID       the pixel used for Purchase optimisation

Commands (run from backend/ with .venv/bin/python):
    scripts/meta_ads.py check                       verify token, account, page, pixel
    scripts/meta_ads.py launch --budget 5 [--live]  create campaign + ad set + ads (PAUSED unless --live)
    scripts/meta_ads.py status                      list campaign/ad set/ad statuses
    scripts/meta_ads.py report [--days 7]           per-ad spend, clicks, CTR, CPC, purchases, cost per purchase
    scripts/meta_ads.py pause <ad_id> | resume <ad_id>
    scripts/meta_ads.py add-ad --image path --name N --headline H --body B [--live]

Creative copy lives in CREATIVES below and mirrors docs/marketing/2026-09-facebook-founder-campaign.md.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import app.config  # noqa: E402,F401  (loads .env.local files)

API = "https://graph.facebook.com/v21.0"
TOKEN = os.getenv("META_ACCESS_TOKEN", "")
ACCOUNT = os.getenv("META_AD_ACCOUNT_ID", "")
PAGE = os.getenv("META_PAGE_ID", "")
PIXEL = os.getenv("META_PIXEL_ID", "")

CAMPAIGN_NAME = "TimeIQ Founder 100"
LANDING = "https://timeiq.app/?utm_source=facebook&utm_medium=paid&utm_campaign=founder100&utm_content={{ad.name}}"
CREATIVES_DIR = Path(__file__).resolve().parent.parent.parent / "docs/marketing/creatives"

CREATIVES = [
    {
        "name": "A-price-shock",
        "image": CREATIVES_DIR / "ad-A-price-shock-1080.png",
        "headline": "Scheduling, timesheets, and invoices. $5/year.",
        "body": (
            "Calendly for booking. Toggl for hours. FreshBooks for invoices. Or one calm app "
            "that does all three for $5 a year. The first 100 people lock that price in for life."
        ),
        "description": "Founding member price, locked forever. Cancel anytime.",
    },
    {
        "name": "B-timesheet",
        "image": CREATIVES_DIR / "ad-B-timesheet-1080.png",
        "headline": "From booked meeting to paid invoice.",
        "body": (
            "You did the work. Now you get to chase the booking, rebuild the timesheet from memory, "
            "and hand-write the invoice. TimeIQ does all three in one place. Log hours in a weekly grid, "
            "click once, and a PDF invoice lands in your client's inbox."
        ),
        "description": "$5/year for the first 100 founding members.",
    },
    {
        "name": "C-founder-spots",
        "image": CREATIVES_DIR / "ad-C-founder-spots-1080.png",
        "headline": "100 founder spots. $5 a year.",
        "body": (
            "We priced our scheduling + invoicing app at $5 a year for the first 100 people. "
            "Not a typo. We want users, not a spreadsheet of trials."
        ),
        "description": "Booking pages, timesheets, PDF invoices.",
    },
    # AI-generated style (gpt-image-2), same three angles, for a creative-style A/B.
    {
        "name": "D-desk-ai",
        "image": CREATIVES_DIR / "ad-D-desk-1080.png",
        "headline": "Scheduling, timesheets, and invoices. $5/year.",
        "body": (
            "If you book calls, log hours, and send invoices, you are paying three apps. "
            "TimeIQ does all three for $5 a year. First 100 people lock it in for life."
        ),
        "description": "Founding member price, locked forever. Cancel anytime.",
    },
    {
        "name": "E-three-apps-ai",
        "image": CREATIVES_DIR / "ad-E-three-apps-1080.png",
        "headline": "One app. $5 a year.",
        "body": (
            "Calendly for booking. Toggl for hours. FreshBooks for invoices. Or one calm app "
            "that does all three for $5 a year."
        ),
        "description": "Scheduling, timesheets, invoices. Cancel anytime.",
    },
    {
        "name": "F-founder-ai",
        "image": CREATIVES_DIR / "ad-F-founder-1080.png",
        "headline": "100 founder spots. $5 a year.",
        "body": (
            "We priced our scheduling + invoicing app at $5 a year for the first 100 people. "
            "Not a typo. We want users, not a spreadsheet of trials."
        ),
        "description": "Founder price locked for life.",
    },
]

TARGETING = {
    "geo_locations": {"countries": ["US", "CA", "GB", "AU"]},
    "age_min": 25,
    "age_max": 54,
    "flexible_spec": [
        {
            "interests": [
                {"id": "6003277229371", "name": "Freelancing"},
                {"id": "6003371567474", "name": "Small business"},
                {"id": "6003020834693", "name": "Entrepreneurship"},
            ]
        }
    ],
}


def die(msg: str) -> None:
    sys.exit(f"error: {msg}")


def call(method: str, path: str, **params):
    params["access_token"] = TOKEN
    if method == "GET":
        r = httpx.get(f"{API}/{path}", params=params, timeout=60)
    else:
        files = params.pop("_files", None)
        r = httpx.post(f"{API}/{path}", data=params, files=files, timeout=120)
    try:
        body = r.json()
    except Exception:
        body = {"raw": r.text}
    if r.status_code >= 400 or "error" in body:
        die(f"{method} {path}: {json.dumps(body.get('error', body))[:500]}")
    return body


def require_env() -> None:
    missing = [n for n, v in (("META_ACCESS_TOKEN", TOKEN), ("META_AD_ACCOUNT_ID", ACCOUNT), ("META_PAGE_ID", PAGE), ("META_PIXEL_ID", PIXEL)) if not v]
    if missing:
        die("missing env: " + ", ".join(missing))


def cmd_check(_: argparse.Namespace) -> None:
    require_env()
    me = call("GET", "me", fields="id,name")
    acct = call("GET", ACCOUNT, fields="name,account_status,currency,amount_spent,funding_source_details")
    page = call("GET", PAGE, fields="name")
    pixel = call("GET", PIXEL, fields="name,last_fired_time")
    print("token user :", me.get("name"), me.get("id"))
    print("ad account :", acct.get("name"), "| status", acct.get("account_status"), "| currency", acct.get("currency"), "| funding", bool(acct.get("funding_source_details")))
    print("page       :", page.get("name"))
    print("pixel      :", pixel.get("name"), "| last fired", pixel.get("last_fired_time"))


def find_campaign() -> dict | None:
    res = call("GET", f"{ACCOUNT}/campaigns", fields="id,name,status,effective_status", limit=50)
    for c in res.get("data", []):
        if c["name"] == CAMPAIGN_NAME:
            return c
    return None


def upload_image(path: Path) -> str:
    with open(path, "rb") as f:
        res = call("POST", f"{ACCOUNT}/adimages", _files={"filename": (path.name, f, "image/png")})
    images = res["images"]
    return next(iter(images.values()))["hash"]


def create_ad(adset_id: str, spec: dict, live: bool) -> str:
    image_hash = upload_image(spec["image"])
    creative = call(
        "POST",
        f"{ACCOUNT}/adcreatives",
        name=f"TimeIQ {spec['name']}",
        object_story_spec=json.dumps(
            {
                "page_id": PAGE,
                "link_data": {
                    "image_hash": image_hash,
                    "link": LANDING,
                    "message": spec["body"],
                    "name": spec["headline"],
                    "description": spec["description"],
                    "call_to_action": {"type": "SIGN_UP", "value": {"link": LANDING}},
                },
            }
        ),
        degrees_of_freedom_spec=json.dumps({"creative_features_spec": {"standard_enhancements": {"enroll_status": "OPT_OUT"}}}),
    )
    ad = call(
        "POST",
        f"{ACCOUNT}/ads",
        name=spec["name"],
        adset_id=adset_id,
        creative=json.dumps({"creative_id": creative["id"]}),
        status="ACTIVE" if live else "PAUSED",
    )
    return ad["id"]


def cmd_launch(args: argparse.Namespace) -> None:
    require_env()
    if find_campaign():
        die(f"campaign '{CAMPAIGN_NAME}' already exists; use status/report/add-ad")
    status = "ACTIVE" if args.live else "PAUSED"
    campaign = call(
        "POST",
        f"{ACCOUNT}/campaigns",
        name=CAMPAIGN_NAME,
        objective="OUTCOME_SALES",
        status=status,
        special_ad_categories=json.dumps([]),
        daily_budget=int(args.budget * 100),
        bid_strategy="LOWEST_COST_WITHOUT_CAP",
    )
    adset = call(
        "POST",
        f"{ACCOUNT}/adsets",
        name="Founder 100 - broad freelancers",
        campaign_id=campaign["id"],
        status=status,
        billing_event="IMPRESSIONS",
        optimization_goal="OFFSITE_CONVERSIONS",
        promoted_object=json.dumps({"pixel_id": PIXEL, "custom_event_type": "PURCHASE"}),
        targeting=json.dumps(TARGETING),
    )
    ads = [create_ad(adset["id"], spec, args.live) for spec in CREATIVES]
    print("campaign", campaign["id"], status)
    print("ad set  ", adset["id"])
    for spec, ad_id in zip(CREATIVES, ads):
        print("ad      ", ad_id, spec["name"])
    if not args.live:
        print("Everything is PAUSED. Review in Ads Manager, then run: scripts/meta_ads.py resume <campaign_id>")


def cmd_status(_: argparse.Namespace) -> None:
    require_env()
    c = find_campaign()
    if not c:
        print("no campaign yet"); return
    print("campaign", c["id"], c["effective_status"])
    for a in call("GET", f"{c['id']}/adsets", fields="id,name,effective_status,daily_budget").get("data", []):
        print("  adset", a["id"], a["name"], a["effective_status"])
    for a in call("GET", f"{c['id']}/ads", fields="id,name,effective_status").get("data", []):
        print("  ad   ", a["id"], a["name"], a["effective_status"])


def cmd_report(args: argparse.Namespace) -> None:
    require_env()
    c = find_campaign()
    if not c:
        die("no campaign yet")
    res = call(
        "GET",
        f"{c['id']}/insights",
        level="ad",
        date_preset=f"last_{args.days}d" if args.days in (7, 14, 28, 30) else "maximum",
        fields="ad_name,spend,impressions,clicks,ctr,cpc,actions,cost_per_action_type",
    )
    print(f"{'ad':<18}{'spend':>8}{'impr':>8}{'clicks':>8}{'ctr%':>7}{'cpc':>7}{'buys':>6}{'cpa':>8}")
    for row in res.get("data", []):
        buys = next((int(float(a["value"])) for a in row.get("actions", []) if a["action_type"] == "purchase"), 0)
        cpa = next((float(a["value"]) for a in row.get("cost_per_action_type", []) if a["action_type"] == "purchase"), 0.0)
        print(f"{row['ad_name']:<18}{float(row['spend']):>8.2f}{int(row['impressions']):>8}{int(row['clicks']):>8}{float(row.get('ctr', 0)):>7.2f}{float(row.get('cpc', 0)):>7.2f}{buys:>6}{cpa:>8.2f}")


def cmd_toggle(args: argparse.Namespace, status: str) -> None:
    require_env()
    call("POST", args.id, status=status)
    print(args.id, "->", status)


def cmd_add_ad(args: argparse.Namespace) -> None:
    require_env()
    c = find_campaign()
    if not c:
        die("no campaign yet; run launch first")
    adset = call("GET", f"{c['id']}/adsets", fields="id").get("data", [])[0]
    spec = {"name": args.name, "image": Path(args.image), "headline": args.headline, "body": args.body, "description": args.description}
    print("ad", create_ad(adset["id"], spec, args.live), args.name)


def main() -> None:
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("check").set_defaults(fn=cmd_check)
    p = sub.add_parser("launch"); p.add_argument("--budget", type=float, default=5.0); p.add_argument("--live", action="store_true"); p.set_defaults(fn=cmd_launch)
    sub.add_parser("status").set_defaults(fn=cmd_status)
    p = sub.add_parser("report"); p.add_argument("--days", type=int, default=7); p.set_defaults(fn=cmd_report)
    p = sub.add_parser("pause"); p.add_argument("id"); p.set_defaults(fn=lambda a: cmd_toggle(a, "PAUSED"))
    p = sub.add_parser("resume"); p.add_argument("id"); p.set_defaults(fn=lambda a: cmd_toggle(a, "ACTIVE"))
    p = sub.add_parser("add-ad")
    for f in ("image", "name", "headline", "body"): p.add_argument(f"--{f}", required=True)
    p.add_argument("--description", default="Founding member price, locked forever."); p.add_argument("--live", action="store_true"); p.set_defaults(fn=cmd_add_ad)
    args = ap.parse_args()
    args.fn(args)


if __name__ == "__main__":
    main()
