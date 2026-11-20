"""LLM routing: Vercel AI Gateway when configured, Anthropic directly otherwise."""
from __future__ import annotations

from types import SimpleNamespace

import pytest

from app.config import settings
from app.services import llm, meeting_agent


@pytest.fixture
def direct(monkeypatch):
    monkeypatch.setattr(settings, "AI_GATEWAY_API_KEY", "")
    monkeypatch.setattr(settings, "ANTHROPIC_API_KEY", "sk-ant-x")
    monkeypatch.setattr(settings, "CHEAP_EXTRACTION_MODELS", False)
    monkeypatch.delenv("VERCEL_OIDC_TOKEN", raising=False)


@pytest.fixture
def gateway(direct, monkeypatch):
    monkeypatch.setattr(settings, "AI_GATEWAY_API_KEY", "gw-key")


def test_direct_uses_anthropic_with_bare_ids(direct):
    client = llm.client()
    assert client.api_key == "sk-ant-x"
    assert "ai-gateway" not in str(client.base_url)
    assert llm.model_id("claude-haiku-5-5") == "claude-haiku-5-5"
    assert llm.model_id("anthropic/claude-haiku-5-5") == "claude-haiku-5-5"
    assert llm.extra_body() is None
    assert llm.extraction_params("claude-haiku-5-5") == {
        "model": "claude-haiku-5-5", "output_config": {"effort": "low"}, "extra_body": None,
    }


def test_only_an_explicit_key_routes_through_the_gateway(direct, monkeypatch):
    monkeypatch.setenv("VERCEL_OIDC_TOKEN", "oidc")
    assert not llm.on_gateway()  # an ambient token never switches providers
    monkeypatch.setattr(settings, "AI_GATEWAY_API_KEY", "gw-key")
    client = llm.client()
    assert str(client.base_url).rstrip("/") == llm.GATEWAY_URL and client.api_key == "gw-key"


def test_gateway_prefixes_models_and_turns_on_zdr(gateway):
    assert llm.configured()
    assert llm.model_id("claude-sonnet-5-5") == "anthropic/claude-sonnet-5-5"
    assert llm.model_id("amazon/nova-lite") == "amazon/nova-lite"
    assert llm.extra_body() == {"providerOptions": {"gateway": {"zeroDataRetention": True}}}
    assert llm.extraction_params("claude-haiku-5-5")["model"] == "anthropic/claude-haiku-5-5"


def test_cheap_models_only_on_the_gateway_and_without_claude_params(direct, monkeypatch):
    monkeypatch.setattr(settings, "CHEAP_EXTRACTION_MODELS", True)
    assert llm.extraction_params("claude-haiku-5-5")["model"] == "claude-haiku-5-5"  # direct: still Claude
    monkeypatch.setattr(settings, "AI_GATEWAY_API_KEY", "gw-key")
    assert llm.extraction_params("claude-haiku-5-5") == {
        "model": "amazon/nova-lite",
        "extra_body": {"providerOptions": {"gateway": {
            "zeroDataRetention": True, "models": ["openai/gpt-5-nano", "mistral/ministral-14b"],
        }}},
        "max_tokens": 8192,
    }


def test_not_configured_without_any_key(direct, monkeypatch):
    monkeypatch.setattr(settings, "ANTHROPIC_API_KEY", "")
    assert not llm.configured()


async def test_meeting_agent_sends_no_effort_to_a_cheap_model(gateway, monkeypatch):
    monkeypatch.setattr(settings, "CHEAP_EXTRACTION_MODELS", True)
    sent = {}

    async def parse(**kwargs):
        sent.update(kwargs)
        return SimpleNamespace(stop_reason="end_turn", parsed_output="ok")

    monkeypatch.setattr(llm, "client", lambda: SimpleNamespace(messages=SimpleNamespace(parse=parse)))
    assert await meeting_agent._parse("system", "text", object) == "ok"
    assert sent["model"] == "amazon/nova-lite" and "output_config" not in sent
    assert sent["extra_body"]["providerOptions"]["gateway"]["models"] == llm.CHEAP_FALLBACKS
