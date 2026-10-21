"""The contract every imagery adapter must satisfy (docs/ARCHITECTURE.md §7.1, §7.4).

Usage from a test module::

    async def test_my_adapter() -> None:
        await assert_imagery_provider_contract(lambda client: MyProvider(client=client))

The factory receives an ``httpx.AsyncClient`` wired to a recorded/stubbed upstream, so the
check is deterministic and offline. Adapters must accept an injected client for that reason.
"""

from __future__ import annotations

from collections.abc import Callable

import httpx
import pytest

from app.core.geo import BBox
from app.modules.imagery.providers import ImageryProvider, TileFetchError
from app.modules.imagery.tests.stubs import JPEG_TILE, PNG_TILE, StubUpstream

KENYA_BBOX = BBox(36.80, -1.30, 36.82, -1.28)

ProviderFactory = Callable[[httpx.AsyncClient], ImageryProvider]


async def assert_imagery_provider_contract(factory: ProviderFactory) -> None:
    probe = factory(StubUpstream().client())

    # --- rights metadata: the credits page and attribution control are generated from it ---
    assert isinstance(probe, ImageryProvider)
    assert probe.category == "imagery"
    assert probe.key and probe.key == probe.key.lower().replace(" ", "_")
    assert probe.attribution.strip()
    assert probe.license.strip()
    assert probe.terms_url.startswith("https://")
    assert isinstance(probe.cacheable, bool)
    assert isinstance(probe.max_zoom, int) and 1 <= probe.max_zoom <= 24
    assert isinstance(probe.covers(KENYA_BBOX), bool)

    # --- a good upstream response is returned byte-for-byte ---
    for body, content_type in ((JPEG_TILE, "image/jpeg"), (PNG_TILE, "image/png")):
        upstream = StubUpstream(body=body, content_type=content_type)
        tile = await factory(upstream.client()).get_tile(8, 150, 130)
        assert tile == body
        assert len(upstream.requests) == 1
        assert upstream.requests[0].method == "GET"
        assert upstream.requests[0].url.scheme == "https"  # never plain HTTP upstream

    # --- "no such tile" is None, not an error ---
    assert await factory(StubUpstream(status=404, body=b"").client()).get_tile(8, 150, 130) is None

    # --- upstream trouble is a TileFetchError (-> 502), never a silent empty tile ---
    for upstream in (
        StubUpstream(status=500, body=b"boom", content_type="text/plain"),
        StubUpstream(status=200, body=b'{"error": "x"}', content_type="application/json"),
    ):
        with pytest.raises(TileFetchError):
            await factory(upstream.client()).get_tile(8, 150, 130)

    def _timeout(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectTimeout("stub timeout", request=request)

    failing = httpx.AsyncClient(transport=httpx.MockTransport(_timeout))
    with pytest.raises(TileFetchError):
        await factory(failing).get_tile(8, 150, 130)
