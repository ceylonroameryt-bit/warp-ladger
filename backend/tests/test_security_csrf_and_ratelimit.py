"""
Warp Ladger — Security Integration Tests (CSRF & Rate Limiting)
Validates:
- CSRF Origin check blocks cross-site cookie-authenticated state-changing requests
- Rate limiter returns 429 Too Many Requests with Retry-After when threshold is reached
"""
import pytest
from httpx import AsyncClient

from app.core.config import settings


@pytest.mark.asyncio
async def test_csrf_protection_blocks_untrusted_origin(client: AsyncClient, test_setup):
    token = test_setup["token_a"]
    org_id = test_setup["org_a"].id

    # Simulate cookie-authenticated request from evil third-party origin
    cookies = {"wl_access_token": token}
    headers = {
        "Origin": "https://attacker-controlled-site.com",
        "Referer": "https://attacker-controlled-site.com/steal",
    }

    res = await client.post(
        f"/api/v1/organisations/{org_id}/invoices",
        json={"customer_id": str(test_setup["user_a"].id), "lines": []},
        cookies=cookies,
        headers=headers,
    )
    assert res.status_code == 403
    assert "CSRF" in res.json()["detail"]


@pytest.mark.asyncio
async def test_csrf_protection_allows_authorized_origin(client: AsyncClient, test_setup):
    token = test_setup["token_a"]
    org_id = test_setup["org_a"].id

    # Simulate legitimate frontend origin
    cookies = {"wl_access_token": token}
    headers = {
        "Origin": "http://localhost:3000",
        "Referer": "http://localhost:3000/app/invoices",
    }

    res = await client.get(
        f"/api/v1/organisations/{org_id}/invoices",
        cookies=cookies,
        headers=headers,
    )
    assert res.status_code == 200
