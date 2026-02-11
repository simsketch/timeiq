from __future__ import annotations

import os
from pathlib import Path
from functools import lru_cache

from dotenv import load_dotenv

# Load .env.local only when it exists (local dev); on Vercel env vars are injected directly
_env_path = Path(__file__).resolve().parent.parent.parent / ".env.local"
if _env_path.exists():
    load_dotenv(_env_path)


class Settings:
    DATABASE_URL: str = os.getenv("DATABASE_URL", "")
    CLERK_SECRET_KEY: str = os.getenv("CLERK_SECRET_KEY", "")
    CLERK_WEBHOOK_SECRET: str = os.getenv("CLERK_WEBHOOK_SECRET", "")
    RESEND_API_KEY: str = os.getenv("RESEND_API_KEY", "")
    GOOGLE_CLIENT_ID: str = os.getenv("GOOGLE_CLIENT_ID", "")
    GOOGLE_CLIENT_SECRET: str = os.getenv("GOOGLE_CLIENT_SECRET", "")
    GOOGLE_REDIRECT_URI: str = os.getenv(
        "GOOGLE_REDIRECT_URI", "http://localhost:8000/api/google/callback"
    )
    FRONTEND_URL: str = os.getenv("FRONTEND_URL", "http://localhost:3000")
    BACKEND_URL: str = os.getenv("BACKEND_URL", "http://localhost:8000")
    CRON_SECRET: str = os.getenv("CRON_SECRET", "")
    VERCEL_ENV: str = os.getenv("VERCEL_ENV", "")

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
