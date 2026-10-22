"""Elevation provider interface and the Copernicus GLO-30 adapter (anonymous AWS Open Data)."""

from __future__ import annotations

import asyncio
import math
import re
from collections.abc import Mapping
from contextlib import ExitStack
from dataclasses import dataclass
from typing import Protocol, runtime_checkable

import numpy as np
import rasterio
from numpy.typing import NDArray
from rasterio.errors import RasterioIOError
from rasterio.merge import merge

from app.core.geo import BBox
from app.modules.regions.providers import DataProvider, ProviderRegistry
from app.modules.terrain.limits import validate_dem_extent

ELEVATION_CATEGORY = "elevation"


class DemError(RuntimeError):
    """Base class for elevation-source failures."""


class DemUnavailableError(DemError):
    """The source has no elevation data for the area (unreleased tile, open ocean, all no-data)."""


class DemFetchError(DemError):
    """The source could not be read right now (network, throttling); retrying may help."""


@dataclass(frozen=True)
class DemRaster:
    """A north-up elevation grid in WGS84 degrees. Metres; ``NaN`` marks no-data."""

    elevation: NDArray[np.float32]  # shape (rows, cols); row 0 is the northern edge
    west: float
    north: float
    pixel_width_deg: float
    pixel_height_deg: float

    @property
    def rows(self) -> int:
        return int(self.elevation.shape[0])

    @property
    def cols(self) -> int:
        return int(self.elevation.shape[1])

    @property
    def bounds(self) -> BBox:
        return BBox(
            self.west,
            self.north - self.rows * self.pixel_height_deg,
            self.west + self.cols * self.pixel_width_deg,
            self.north,
        )


@runtime_checkable
class ElevationProvider(DataProvider, Protocol):
    """A :class:`DataProvider` that serves a DEM window (``category == "elevation"``)."""

    @property
    def resolution_m(self) -> float:
        """Nominal ground sampling distance, metres."""
        ...

    async def get_dem(self, bbox: BBox) -> DemRaster:
        """Elevation grid covering ``bbox`` (snapped outwards to the source's pixel grid).

        Raises :class:`DemUnavailableError` if the source has nothing there and
        :class:`DemFetchError` if the call failed.
        """
        ...


_NODATA_SENTINEL = -32768.0
# GDAL reports a missing object as 404 or, on a public bucket without list rights, as 403.
_MISSING = re.compile(r"404|403|not exist|no such file|not found|access ?denied", re.IGNORECASE)


def tile_name(lon_floor: int, lat_floor: int) -> str:
    """Copernicus tile id for the 1°x1° cell whose south-west corner is (lon, lat)."""
    ns = "N" if lat_floor >= 0 else "S"
    ew = "E" if lon_floor >= 0 else "W"
    return f"Copernicus_DSM_COG_10_{ns}{abs(lat_floor):02d}_00_{ew}{abs(lon_floor):03d}_00_DEM"


def tiles_for(bbox: BBox) -> list[str]:
    """Names of the 1° tiles intersecting ``bbox`` (a max edge on a whole degree adds none)."""
    lon0, lat0 = math.floor(bbox.min_lon), math.floor(bbox.min_lat)
    lons = range(lon0, max(math.ceil(bbox.max_lon), lon0 + 1))
    lats = range(lat0, max(math.ceil(bbox.max_lat), lat0 + 1))
    return [tile_name(lon, lat) for lat in lats for lon in lons]


class CopernicusDemAwsProvider:
    """Copernicus DEM GLO-30 (~30 m) read from the public ``copernicus-dem-30m`` bucket.

    The tiles are Cloud-Optimized GeoTIFFs, so GDAL's ``/vsis3/`` driver fetches only the
    window we need. Access is **anonymous and unsigned** (``AWS_NO_SIGN_REQUEST``): no AWS
    account, key or cost. Open ocean has no tile; unreleased tiles are absent too, and both
    surface as :class:`DemUnavailableError`.

    ``tile_uri`` is the GDAL path template (``{name}`` = tile id); tests point it at local files.
    """

    key = "copernicus_dem_glo30"
    category = ELEVATION_CATEGORY
    # Must match the metadata-only catalog entry this adapter replaces (docs/DATA_SOURCES.md).
    attribution = "Copernicus DEM © ESA (produced from ©Airbus DS and others)"
    license = "Free for general public under the Copernicus DEM licence"
    terms_url = "https://registry.opendata.aws/copernicus-dem/"
    cacheable = True
    resolution_m = 30.0

    DEFAULT_TILE_URI = "/vsis3/copernicus-dem-30m/{name}/{name}.tif"
    DEFAULT_ENV: Mapping[str, str] = {
        "AWS_NO_SIGN_REQUEST": "YES",
        "AWS_REGION": "eu-central-1",
        "GDAL_DISABLE_READDIR_ON_OPEN": "EMPTY_DIR",
        "CPL_VSIL_CURL_ALLOWED_EXTENSIONS": ".tif",
        "GDAL_HTTP_MAX_RETRY": "3",
        "GDAL_HTTP_TIMEOUT": "60",
    }

    def __init__(
        self, tile_uri: str = DEFAULT_TILE_URI, env: Mapping[str, str] | None = None
    ) -> None:
        self._tile_uri = tile_uri
        self._env = dict(self.DEFAULT_ENV if env is None else env)

    def covers(self, bbox: BBox) -> bool:
        return True  # global; gaps (ocean, unreleased tiles) show up at read time

    async def get_dem(self, bbox: BBox) -> DemRaster:
        return await asyncio.to_thread(self._read, bbox)

    def _read(self, bbox: BBox) -> DemRaster:
        validate_dem_extent(bbox)
        with rasterio.Env(**self._env), ExitStack() as stack:
            datasets = []
            for name in tiles_for(bbox):
                path = self._tile_uri.format(name=name)
                try:
                    datasets.append(stack.enter_context(rasterio.open(path)))
                except RasterioIOError as exc:
                    if _MISSING.search(str(exc)):
                        continue  # no such tile: ocean or unreleased
                    raise DemFetchError(f"could not read DEM tile {name}: {exc}") from exc
            if not datasets:
                raise DemUnavailableError("no Copernicus DEM tile exists for this area")

            first = datasets[0]
            res_x, res_y = first.res
            validate_dem_extent(bbox, res_x, res_y)
            origin_x, origin_y = first.transform.c, first.transform.f
            # Snap outwards to the tile pixel grid so merging copies pixels instead of resampling.
            west = origin_x + math.floor((bbox.min_lon - origin_x) / res_x) * res_x
            east = origin_x + math.ceil((bbox.max_lon - origin_x) / res_x) * res_x
            north = origin_y - math.floor((origin_y - bbox.max_lat) / res_y) * res_y
            south = origin_y - math.ceil((origin_y - bbox.min_lat) / res_y) * res_y
            try:
                data, _ = merge(
                    datasets,
                    bounds=(west, south, east, north),
                    res=(res_x, res_y),
                    nodata=_NODATA_SENTINEL,
                    dtype="float32",
                )
            except RasterioIOError as exc:
                raise DemFetchError(f"could not read DEM window: {exc}") from exc

            elevation = data[0].astype(np.float32, copy=True)
            elevation[elevation == _NODATA_SENTINEL] = np.nan
            for ds in datasets:
                if ds.nodata is not None:
                    elevation[elevation == np.float32(ds.nodata)] = np.nan
            elevation[~np.isfinite(elevation)] = np.nan
            return DemRaster(elevation, west, north, res_x, res_y)


def register_terrain_providers(registry: ProviderRegistry) -> None:
    """Replace the metadata-only catalog entry with the real adapter (same key)."""
    registry.register(CopernicusDemAwsProvider(), replace=True)
