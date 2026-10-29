"""Application shutdown releases pooled clients even across repeated lifecycles."""

from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from app.main import app, lifespan
from app.modules.imagery.providers import get_http_client


async def test_repeated_lifespans_close_and_replace_http_client(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    dispose = AsyncMock()
    monkeypatch.setattr("app.main.engine", SimpleNamespace(dispose=dispose))
    async with lifespan(app):
        first = get_http_client()
        assert not first.is_closed
    assert first.is_closed
    async with lifespan(app):
        second = get_http_client()
        assert second is not first
    assert second.is_closed
    assert dispose.await_count == 2
