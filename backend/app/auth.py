from __future__ import annotations

import time
from typing import Any

import httpx
import jwt
from fastapi import Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models.user import User

# Cache for Clerk JWKS
_jwks_cache: dict[str, Any] = {"keys": None, "fetched_at": 0}
_JWKS_CACHE_TTL = 3600  # 1 hour


async def _get_clerk_jwks() -> dict[str, Any]:
    """Fetch and cache Clerk's JWKS."""
    now = time.time()
    if (
        _jwks_cache["keys"] is not None
        and now - _jwks_cache["fetched_at"] < _JWKS_CACHE_TTL
    ):
        return _jwks_cache["keys"]

    async with httpx.AsyncClient() as client:
        resp = await client.get(
            "https://api.clerk.com/v1/jwks",
            headers={"Authorization": f"Bearer {settings.CLERK_SECRET_KEY}"},
        )
        resp.raise_for_status()
        data = resp.json()

    _jwks_cache["keys"] = data
    _jwks_cache["fetched_at"] = now
    return data


def _find_rsa_key(jwks: dict[str, Any], kid: str) -> dict[str, Any] | None:
    """Find the RSA key matching the given kid in the JWKS."""
    for key in jwks.get("keys", []):
        if key.get("kid") == kid:
            return key
    return None


async def get_current_user_clerk_id(request: Request) -> str:
    """Verify the Clerk JWT from the Authorization header and return the clerk_id (sub claim)."""
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid Authorization header",
        )

    token = auth_header.split(" ", 1)[1]

    try:
        # Decode header to get kid
        unverified_header = jwt.get_unverified_header(token)
        kid = unverified_header.get("kid")
        if not kid:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token missing kid in header",
            )

        # Fetch JWKS and find the matching key
        jwks = await _get_clerk_jwks()
        rsa_key_data = _find_rsa_key(jwks, kid)
        if rsa_key_data is None:
            # Refresh JWKS cache in case keys rotated
            _jwks_cache["keys"] = None
            jwks = await _get_clerk_jwks()
            rsa_key_data = _find_rsa_key(jwks, kid)
            if rsa_key_data is None:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Unable to find matching signing key",
                )

        # Build the public key from JWKS
        public_key = jwt.algorithms.RSAAlgorithm.from_jwk(rsa_key_data)

        # Verify and decode the token
        payload = jwt.decode(
            token,
            public_key,
            algorithms=["RS256"],
            options={"verify_aud": False},
        )

        clerk_id = payload.get("sub")
        if not clerk_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token missing sub claim",
            )

        return clerk_id

    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired",
        )
    except jwt.InvalidTokenError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid token: {str(e)}",
        )


async def get_current_user(
    clerk_id: str = Depends(get_current_user_clerk_id),
    db: AsyncSession = Depends(get_db),
) -> User:
    """Look up the User record from the database using the clerk_id."""
    result = await db.execute(
        select(User).where(User.clerk_id == clerk_id)
    )
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found. Please ensure your account has been synced.",
        )
    return user
