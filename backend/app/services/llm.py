"""One place that picks how LLM calls are made: through Vercel AI Gateway when it's
configured (AI_GATEWAY_API_KEY, or VERCEL_OIDC_TOKEN on Vercel), otherwise straight
to Anthropic with ANTHROPIC_API_KEY. The gateway speaks the Anthropic Messages API,
so every caller keeps using the anthropic SDK."""
from __future__ import annotations

import os
from typing import Any

from app.config import settings

GATEWAY_URL = "https://ai-gateway.vercel.sh"
CHEAP_MODEL = "amazon/nova-lite"
CHEAP_FALLBACKS = ["openai/gpt-5-nano", "mistral/ministral-14b"]


def _gateway_key() -> str:
    return settings.AI_GATEWAY_API_KEY or os.getenv("VERCEL_OIDC_TOKEN", "")


def on_gateway() -> bool:
    return bool(_gateway_key())


def configured() -> bool:
    return on_gateway() or bool(settings.ANTHROPIC_API_KEY)


def client():
    import anthropic  # slow to import; only LLM callers need it

    if key := _gateway_key():
        return anthropic.AsyncAnthropic(api_key=key, base_url=GATEWAY_URL)
    return anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)


def model_id(name: str) -> str:
    """The gateway wants provider-prefixed ids ("anthropic/claude-..."); Anthropic wants bare ones."""
    if on_gateway():
        return name if "/" in name else f"anthropic/{name}"
    return name.removeprefix("anthropic/")


def extra_body(fallbacks: list[str] | None = None) -> dict[str, Any] | None:
    """Gateway options: zero data retention always, plus fallback models. None off the gateway."""
    if not on_gateway():
        return None
    gateway: dict[str, Any] = {"zeroDataRetention": True}
    if fallbacks:
        gateway["models"] = [model_id(m) for m in fallbacks]
    return {"providerOptions": {"gateway": gateway}}


def extraction_params(claude_model: str) -> dict[str, Any]:
    """model / output_config / extra_body for a structured-extraction call. The cheap
    non-Claude models get no Claude-only params (effort)."""
    if settings.CHEAP_EXTRACTION_MODELS and on_gateway():
        return {"model": CHEAP_MODEL, "extra_body": extra_body(CHEAP_FALLBACKS)}
    return {"model": model_id(claude_model), "output_config": {"effort": "low"}, "extra_body": extra_body()}
