"""Business logic for sites: boundary validation, measurement, ownership. No FastAPI imports."""

from __future__ import annotations

import asyncio
import uuid
from dataclasses import dataclass
from typing import Any

from geoalchemy2.shape import from_shape
from shapely.geometry import Point, Polygon
from shapely.geometry.polygon import orient
from shapely.validation import explain_validity

from app.core.geo import WGS84_SRID, bbox_of, utm_epsg
from app.modules.sites.country import CountryLocator, locate_country
from app.modules.sites.models import Site
from app.modules.sites.repository import SiteRepository


class SiteError(Exception):
    """Base class for domain errors raised by the sites service."""


class InvalidBoundaryError(SiteError):
    """The supplied coordinates do not form a usable polygon."""


class SiteNotFoundError(SiteError):
    pass


class SiteForbiddenError(SiteError):
    """The caller does not own the site."""


@dataclass(frozen=True)
class MeasuredBoundary:
    polygon: Polygon
    centroid: Point
    bbox: list[float]
    utm_epsg: int


def build_boundary(coordinates: list[tuple[float, float]]) -> MeasuredBoundary:
    """Validate a ``[lng, lat]`` ring and derive centroid, bbox and UTM zone.

    The ring is closed if needed, wound counter-clockwise, and rejected when it has fewer
    than 3 distinct vertices or is not a valid simple polygon (e.g. self-intersecting).
    """
    ring = [(float(x), float(y)) for x, y in coordinates]
    if ring and ring[0] != ring[-1]:
        ring.append(ring[0])
    if len(set(ring)) < 3:
        raise InvalidBoundaryError("A boundary needs at least 3 distinct points.")

    polygon = Polygon(ring)
    if not polygon.is_valid:
        raise InvalidBoundaryError(f"Invalid boundary: {explain_validity(polygon)}.")
    if polygon.area == 0:
        raise InvalidBoundaryError("Invalid boundary: the points are collinear (zero area).")

    polygon = orient(polygon, sign=1.0)
    # Planar centroid in lng/lat: negligible error at parcel scale.
    centroid = polygon.centroid
    return MeasuredBoundary(
        polygon=polygon,
        centroid=centroid,
        bbox=list(bbox_of(polygon).as_tuple()),
        utm_epsg=utm_epsg(centroid.x, centroid.y),
    )


class SiteService:
    def __init__(
        self, repo: SiteRepository, country_locator: CountryLocator = locate_country
    ) -> None:
        self._repo = repo
        self._locate_country = country_locator

    async def _measure(
        self, coordinates: list[tuple[float, float]]
    ) -> tuple[dict[str, Any], tuple[float, float]]:
        """Column values derived from a boundary, plus the centroid ``(lng, lat)``."""
        m = build_boundary(coordinates)
        columns = {
            "boundary": from_shape(m.polygon, srid=WGS84_SRID),
            "centroid": from_shape(m.centroid, srid=WGS84_SRID),
            "bbox": m.bbox,
            "utm_epsg": m.utm_epsg,
            "area_m2": await self._repo.geodesic_area_m2(m.polygon),
        }
        return columns, (m.centroid.x, m.centroid.y)

    async def _derive_country(self, xy: tuple[float, float]) -> str | None:
        # The locator may do blocking I/O on first use (dataset load), so keep it off the loop.
        return await asyncio.to_thread(self._locate_country, *xy)

    async def create(
        self,
        *,
        owner_id: uuid.UUID | None,
        name: str,
        coordinates: list[tuple[float, float]],
        country_code: str | None = None,
    ) -> Site:
        columns, xy = await self._measure(coordinates)
        country = country_code.upper() if country_code else await self._derive_country(xy)
        return await self._repo.add(owner_id=owner_id, name=name, country_code=country, **columns)

    async def get(self, site_id: uuid.UUID, owner_id: uuid.UUID | None) -> Site:
        site = await self._repo.get(site_id)
        if site is None:
            raise SiteNotFoundError(str(site_id))
        if site.owner_id != owner_id:
            raise SiteForbiddenError(str(site_id))
        return site

    async def list_for_owner(
        self, owner_id: uuid.UUID | None, limit: int, offset: int
    ) -> tuple[list[Site], int]:
        return await self._repo.list_for_owner(owner_id, limit, offset)

    async def update(
        self,
        site_id: uuid.UUID,
        owner_id: uuid.UUID | None,
        *,
        name: str | None = None,
        country_code: str | None = None,
        coordinates: list[tuple[float, float]] | None = None,
    ) -> Site:
        site = await self.get(site_id, owner_id)
        changes: dict[str, Any] = {}
        if name is not None:
            changes["name"] = name
        if country_code is not None:
            changes["country_code"] = country_code.upper()
        if coordinates is not None:
            columns, xy = await self._measure(coordinates)
            changes.update(columns)
            # The boundary moved: re-derive the country unless the caller pinned one.
            if country_code is None:
                changes["country_code"] = await self._derive_country(xy) or site.country_code
        return await self._repo.update(site, **changes)

    async def delete(self, site_id: uuid.UUID, owner_id: uuid.UUID | None) -> None:
        site = await self.get(site_id, owner_id)
        await self._repo.soft_delete(site)
