"""Vercel Python serverless entry point.

Vercel's Python runtime looks for an ASGI/WSGI app in api/index.py.
We simply re-export the FastAPI app from our main module.
"""

import sys
from pathlib import Path

# Ensure the backend root is on sys.path so `app.*` imports resolve
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.main import app  # noqa: E402, F401
