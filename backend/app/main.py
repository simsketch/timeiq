from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import engine

# Import all models so they are registered with Base.metadata
from app.models import (  # noqa: F401
    AvailabilityRule,
    Booking,
    CachedEvent,
    CalendarSource,
    EventType,
    User,
)
from app.routers import (
    availability,
    bookings,
    calendars,
    cron,
    event_types,
    google_auth,
    public,
    users,
    webhooks,
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown events."""
    logger.info("TimeIQ API starting up")
    yield
    # Cleanup
    await engine.dispose()


app = FastAPI(
    title="TimeIQ",
    description="Scheduling and booking API",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        settings.FRONTEND_URL,
        "http://localhost:3000",
        "http://localhost:3001",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(webhooks.router)
app.include_router(users.router)
app.include_router(event_types.router)
app.include_router(availability.router)
app.include_router(bookings.router)
app.include_router(calendars.router)
app.include_router(google_auth.router)
app.include_router(public.router)
app.include_router(cron.router)


@app.get("/api/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "ok", "service": "timeiq-api"}
