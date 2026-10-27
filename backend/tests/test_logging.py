import pytest
from httpx import ASGITransport, AsyncClient
from starlette.applications import Starlette
from starlette.responses import JSONResponse
from starlette.routing import Route
from structlog.testing import capture_logs

from app.core.logging import RequestIDMiddleware


@pytest.mark.parametrize("status", [200, 404, 500])
async def test_share_tokens_are_redacted(status: int) -> None:
    async def endpoint(request):
        if status == 500:
            raise RuntimeError("synthetic failure")
        return JSONResponse({}, status_code=status)

    application = Starlette(routes=[Route("/api/v1/shared/{token}/export", endpoint)])
    application.add_middleware(RequestIDMiddleware)
    with capture_logs() as logs:
        async with AsyncClient(
            transport=ASGITransport(app=application, raise_app_exceptions=False),
            base_url="http://test",
        ) as client:
            response = await client.get("/api/v1/shared/secret-for-audit/export")
    assert response.status_code == status
    assert logs
    assert all("secret-for-audit" not in str(log) for log in logs)
    assert any("[redacted]" in str(log.get("path", "")) for log in logs)
