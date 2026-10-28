from __future__ import annotations

import os
from pathlib import Path
from functools import lru_cache

from dotenv import load_dotenv

# Load .env.local files only when they exist (local dev); on Vercel env vars are
# injected directly. The repo-root file is shared with the frontend; backend/.env.local
# holds backend-only values and wins on conflicts.
_backend_dir = Path(__file__).resolve().parent.parent
for _env_path, _override in (
    (_backend_dir.parent / ".env.local", False),
    (_backend_dir / ".env.local", True),
):
    if _env_path.exists():
        load_dotenv(_env_path, override=_override)


class Settings:
    DATABASE_URL: str = os.getenv("DATABASE_URL", "")
    CLERK_SECRET_KEY: str = os.getenv("CLERK_SECRET_KEY", "")
    CLERK_WEBHOOK_SECRET: str = os.getenv("CLERK_WEBHOOK_SECRET", "")
    RESEND_API_KEY: str = os.getenv("RESEND_API_KEY", "")
    # Emailed schedules: Resend inbound (webhook secret + a key that can read
    # received mail) and Claude to read the schedule.
    RESEND_INBOUND_API_KEY: str = os.getenv("RESEND_INBOUND_API_KEY", "")
    RESEND_INBOUND_WEBHOOK_SECRET: str = os.getenv("RESEND_INBOUND_WEBHOOK_SECRET", "")
    INBOUND_DOMAIN: str = os.getenv("INBOUND_DOMAIN", "timeiq.app")
    ANTHROPIC_API_KEY: str = os.getenv("ANTHROPIC_API_KEY", "")
    GOOGLE_CLIENT_ID: str = os.getenv("GOOGLE_CLIENT_ID", "")
    GOOGLE_CLIENT_SECRET: str = os.getenv("GOOGLE_CLIENT_SECRET", "")
    GOOGLE_REDIRECT_URI: str = os.getenv(
        "GOOGLE_REDIRECT_URI", "http://localhost:8000/api/google/callback"
    )
    MS_CLIENT_ID: str = os.getenv("MS_CLIENT_ID", "")
    MS_CLIENT_SECRET: str = os.getenv("MS_CLIENT_SECRET", "")
    MS_TENANT: str = os.getenv("MS_TENANT", "common")
    FRONTEND_URL: str = os.getenv("FRONTEND_URL", "http://localhost:3000")
    BACKEND_URL: str = os.getenv("BACKEND_URL", "http://localhost:8000")
    CRON_SECRET: str = os.getenv("CRON_SECRET", "")
    # Billing (Stripe). Leave STRIPE_SECRET_KEY empty to disable the paywall.
    # STRIPE_SECRET_KEY wins; *_TEST is a convenience for local dev files.
    STRIPE_SECRET_KEY: str = os.getenv("STRIPE_SECRET_KEY") or os.getenv(
        "STRIPE_SECRET_KEY_TEST", ""
    )
    STRIPE_WEBHOOK_SECRET: str = os.getenv("STRIPE_WEBHOOK_SECRET", "")
    STRIPE_PRICE_FOUNDER: str = os.getenv("STRIPE_PRICE_FOUNDER", "")
    STRIPE_PRICE_STANDARD: str = os.getenv("STRIPE_PRICE_STANDARD", "")
    FOUNDER_SEATS: int = int(os.getenv("FOUNDER_SEATS", "100"))
    VERCEL_ENV: str = os.getenv("VERCEL_ENV", "")

    @property
    def microsoft_enabled(self) -> bool:
        return bool(self.MS_CLIENT_ID.strip() and self.MS_CLIENT_SECRET.strip())

    @property
    def microsoft_redirect_uri(self) -> str:
        return f"{self.BACKEND_URL.rstrip('/')}/api/microsoft/callback"

    @property
    def async_database_url(self) -> str:
        """Convert postgresql:// to postgresql+asyncpg:// for async SQLAlchemy."""
        url = self.DATABASE_URL
        if url.startswith("postgresql://"):
            url = url.replace("postgresql://", "postgresql+asyncpg://", 1)
        # asyncpg uses ssl= instead of sslmode=
        url = url.replace("?sslmode=require", "?ssl=require")
        url = url.replace("&sslmode=require", "&ssl=require")
        return url

    @property
    def sync_database_url(self) -> str:
        """Return the original postgresql:// URL for Alembic sync operations."""
        return self.DATABASE_URL


@lru_cache()
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
