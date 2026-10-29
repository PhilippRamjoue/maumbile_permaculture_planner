"""Imagery provider interface and the keyless XYZ/WMTS adapters."""

from __future__ import annotations

from typing import Protocol, runtime_checkable

import httpx

from app.core.geo import BBox
from app.modules.regions.providers import DataProvider, ProviderRegistry

IMAGERY_CATEGORY = "imagery"
USER_AGENT = "permaculture-planner/0.1 (open-source, non-commercial)"


class TileFetchError(RuntimeError):
    """The upstream provider failed (timeout, 5xx, non-image response)."""


@runtime_checkable
class ImageryProvider(DataProvider, Protocol):
    """A :class:`DataProvider` that serves XYZ raster tiles (``category == "imagery"``)."""

    @property
    def max_zoom(self) -> int:
        """Highest zoom level this source has data for; deeper requests are not forwarded."""
        ...

    async def get_tile(self, z: int, x: int, y: int) -> bytes | None:
        """Image bytes (PNG/JPEG) of the tile, ``None`` if the source has no such tile.

        Raises :class:`TileFetchError` when the upstream call fails.
        """
        ...


_shared_client: httpx.AsyncClient | None = None


def get_http_client() -> httpx.AsyncClient:
    """Process-wide upstream client (connection pooling); adapters accept an injected one."""
    global _shared_client
    if _shared_client is None:
        _shared_client = httpx.AsyncClient(
            timeout=httpx.Timeout(10.0),
            headers={"User-Agent": USER_AGENT},
            follow_redirects=True,
        )
    return _shared_client


async def close_http_client() -> None:
    """Release pooled connections; the next lifespan can safely create a fresh client."""
    global _shared_client
    client, _shared_client = _shared_client, None
    if client is not None:
        await client.aclose()


class HttpTileProvider:
    """Shared plumbing for providers that serve tiles over plain HTTP GET."""

    category = IMAGERY_CATEGORY
    key: str
    #: Short name for the "Satellite source" choice, which also says what the source is good for.
    label: str
    attribution: str
    license: str
    terms_url: str
    cacheable: bool
    max_zoom: int

    def __init__(self, client: httpx.AsyncClient | None = None) -> None:
        self._client = client

    def tile_url(self, z: int, x: int, y: int) -> str:
        raise NotImplementedError

    def covers(self, bbox: BBox) -> bool:
        return True  # global sources; per-area gaps show up as missing tiles (``None``)

    async def get_tile(self, z: int, x: int, y: int) -> bytes | None:
        client = self._client or get_http_client()
        try:
            response = await client.get(self.tile_url(z, x, y))
        except httpx.HTTPError as exc:
            raise TileFetchError(f"{self.key}: request failed: {exc!r}") from exc
        if response.status_code in (204, 404):
            return None
        if response.status_code != 200:
            raise TileFetchError(f"{self.key}: upstream returned HTTP {response.status_code}")
        if not response.headers.get("content-type", "").startswith("image/"):
            raise TileFetchError(f"{self.key}: upstream did not return an image")
        return response.content


class EsriWorldImageryProvider(HttpTileProvider):
    """Esri World Imagery: keyless XYZ (z/y/x) JPEG tiles. Never stored (Esri ToS)."""

    key = "esri_world_imagery"
    label = "Esri World Imagery (sharpest)"
    attribution = "Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community"
    license = (
        "Esri Terms of Use (grey for commercial; used here for a free/non-commercial "
        "deployment with attribution)"
    )
    terms_url = "https://www.arcgis.com/home/item.html?id=10df2279f9684e4a9f6a7f08febac2a9"
    cacheable = False
    max_zoom = 19

    _URL = "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile"

    def tile_url(self, z: int, x: int, y: int) -> str:
        return f"{self._URL}/{z}/{y}/{x}"


class Sentinel2CloudlessProvider(HttpTileProvider):
    """Sentinel-2 cloudless 2016 mosaic by EOX (WMTS, GoogleMapsCompatible), CC-BY-4.0.

    ~10 m resolution, so useful to roughly zoom 13. The 2016 layer is the CC-BY one; newer
    s2cloudless years carry a non-commercial licence, which is why the layer is pinned here.
    """

    key = "sentinel2_cloudless"
    label = "Sentinel-2 cloudless (10 m, 2016)"
    attribution = (
        "Sentinel-2 cloudless — https://s2maps.eu by EOX IT Services GmbH "
        "(contains modified Copernicus Sentinel data)"
    )
    license = "CC-BY-4.0"
    terms_url = "https://s2maps.eu"
    cacheable = True
    max_zoom = 13

    _URL = "https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless_3857/default/GoogleMapsCompatible"

    def tile_url(self, z: int, x: int, y: int) -> str:
        return f"{self._URL}/{z}/{y}/{x}.jpg"


class OpenStreetMapProvider(HttpTileProvider):
    """OpenStreetMap standard tiles: keyless XYZ (z/x/y) PNG.

    Streets, roads and labels rather than aerial, but sharp to zoom 19 — useful for tracing roads
    and boundaries. Proxied with a descriptive User-Agent and cached, to stay within the OSMF tile
    usage policy (light, non-bulk use); see https://operations.osmfoundation.org/policies/tiles/.
    """

    key = "osm_standard"
    label = "OpenStreetMap (streets & roads)"
    attribution = "© OpenStreetMap contributors"
    license = "Map data ODbL 1.0; map tiles © OpenStreetMap Foundation (tile usage policy)"
    terms_url = "https://www.openstreetmap.org/copyright"
    cacheable = True
    max_zoom = 19

    def tile_url(self, z: int, x: int, y: int) -> str:
        return f"https://tile.openstreetmap.org/{z}/{x}/{y}.png"


def register_imagery_providers(registry: ProviderRegistry) -> None:
    """Replace the metadata-only catalog entries with the real adapters (same keys)."""
    for provider in (
        EsriWorldImageryProvider(),
        OpenStreetMapProvider(),
        Sentinel2CloudlessProvider(),
    ):
        registry.register(provider, replace=True)
