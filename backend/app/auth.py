from __future__ import annotations

import re
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


CLERK_USER_ID = re.compile(r"user_[A-Za-z0-9]+")


async def get_current_user_clerk_id(request: Request, db: AsyncSession = Depends(get_db)) -> str:
    """Return the clerk_id of the caller: a Clerk session JWT, personal token or OAuth access token."""
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid Authorization header",
        )

    token = auth_header.split(" ", 1)[1]

    from app.services import api_tokens, oauth

    if oauth.looks_like_token(token):
        user = await oauth.user_for(db, token)
        if user is None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED,
                                detail="This app connection expired or was disconnected. Add the TimeIQ connector again.")
        request.state.auth_method = "token"
        return user.clerk_id

    # Personal access tokens (Settings → API tokens), used by MCP clients and scripts.
    if api_tokens.looks_like_token(token):
        user = await api_tokens.user_for(db, token)
        if user is None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or revoked API token")
        request.state.auth_method = "token"
        return user.clerk_id
    request.state.auth_method = "session"

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
        # Clerk user IDs are "user_" plus letters and digits. The ID ends up in
        # Clerk API URLs and log lines, so refuse anything else outright.
        if not CLERK_USER_ID.fullmatch(clerk_id):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token sub claim is not a Clerk user ID",
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


def require_session_auth(request: Request) -> None:
    """Refuse API tokens: for creating tokens and deleting the account, so a leaked
    token can't mint more tokens or destroy the account."""
    if getattr(request.state, "auth_method", None) == "token":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Sign in on timeiq.app to do this; API tokens can't.",
        )


async def get_current_user_unrestricted(
    clerk_id: str = Depends(get_current_user_clerk_id),
    db: AsyncSession = Depends(get_db),
) -> User:
    """Look up the User record from the database using the clerk_id.

    Does not check the subscription. Use for profile, sync, and billing routes.
    """
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


async def get_current_user(
    user: User = Depends(get_current_user_unrestricted),
) -> User:
    """Current user, additionally requiring an entitled subscription when billing is on."""
    from app.services import billing

    if billing.enabled() and not billing.is_entitled(user):
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail="subscription_required",
        )
    return user
