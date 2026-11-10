import httpx
import pytest

from app.config import settings
from app.services.ad_performance import fetch_report


@pytest.mark.asyncio
async def test_meta_report_uses_link_clicks_paginates_and_sums_actions(monkeypatch):
    monkeypatch.setattr(settings, "META_ACCESS_TOKEN", "private-test-token")
    monkeypatch.setattr(settings, "META_AD_ACCOUNT_ID", "act_123")
    original = httpx.AsyncClient
    requests = []
    def respond(request):
        requests.append(request)
        assert request.headers["authorization"] == "Bearer private-test-token"
        assert "private-test-token" not in str(request.url)
        if request.url.path.endswith("/act_123"):
            return httpx.Response(200, json={"currency": "USD", "timezone_name": "America/New_York"})
        assert request.url.path.endswith("/120251255611590756/insights")
        row = {"ad_id": "123", "ad_name": "A", "campaign_name": "TimeIQ", "spend": "3.50", "impressions": "100", "inline_link_clicks": "4", "clicks": "9", "date_start": "2026-10-01", "actions": [{"action_type": "landing_page_view", "value": "2"}, {"action_type": "complete_registration", "value": "1"}, {"action_type": "purchase", "value": "1"}]}
        if request.url.params.get("after"):
            return httpx.Response(200, json={"data": [row]})
        return httpx.Response(200, json={"data": [row], "paging": {"next": "https://untrusted.invalid", "cursors": {"after": "next-page"}}})
    monkeypatch.setattr(httpx, "AsyncClient", lambda **kwargs: original(transport=httpx.MockTransport(respond), **kwargs))
    result = await fetch_report(7)
    assert result["totals"] == {"spend": 7.0, "impressions": 200, "link_clicks": 8, "landing_page_views": 4, "meta_registrations": 2, "purchases": 2}
    assert len(requests) == 3
    assert all(r.url.host == "graph.facebook.com" for r in requests)
    assert "time_range" in requests[1].url.params
    assert result["since"] < result["until"]


@pytest.mark.asyncio
async def test_meta_reporting_without_credentials_has_clear_error(monkeypatch):
    monkeypatch.setattr(settings, "META_ACCESS_TOKEN", "")
    with pytest.raises(ValueError, match="not connected"):
        await fetch_report(7)
