"""Region endpoints: attribution (credits page) and region profiles."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Path, Query
from pydantic import BaseModel

from app.core.geo import BBox
from app.modules.regions.attribution import SourceInfo, all_sources, sources_for_region
from app.modules.regions.deps import get_resolver
from app.modules.regions.profiles import RegionProfile
from app.modules.regions.resolver import RegionResolver

router = APIRouter()

ResolverDep = Annotated[RegionResolver, Depends(get_resolver)]
_COUNTRY_PATTERN = r"^[A-Za-z]{2}$"


class AttributionResponse(BaseModel):
    sources: list[SourceInfo]


def _parse_bbox(raw: str) -> BBox:
    try:
        min_lon, min_lat, max_lon, max_lat = (float(part) for part in raw.split(","))
    except ValueError:
        raise HTTPException(422, "bbox must be 'min_lon,min_lat,max_lon,max_lat'") from None
    if not (-180 <= min_lon < max_lon <= 180 and -90 <= min_lat < max_lat <= 90):
        raise HTTPException(422, "bbox is out of range or not min < max")
    return BBox(min_lon, min_lat, max_lon, max_lat)


@router.get("/attribution", response_model=AttributionResponse)
async def attribution(
    resolver: ResolverDep,
    country: Annotated[str | None, Query(pattern=_COUNTRY_PATTERN)] = None,
    bbox: Annotated[str | None, Query(description="min_lon,min_lat,max_lon,max_lat")] = None,
    keys: Annotated[str | None, Query(description="comma-separated provider keys")] = None,
) -> AttributionResponse:
    """Sources, licenses and terms links driving the "Data sources & credits" page.

    - ``keys``: exactly those providers (e.g. the ones a site used);
    - ``country`` [+ ``bbox``]: the providers for that region (resolved ones with a bbox,
      the whole chain without);
    - nothing: every registered provider.
    """
    if keys is not None:
        wanted = [k.strip() for k in keys.split(",") if k.strip()]
        known = {s.key: s for s in all_sources(resolver)}
        missing = [k for k in wanted if k not in known]
        if missing:
            raise HTTPException(404, f"unknown provider keys: {', '.join(missing)}")
        return AttributionResponse(sources=[known[k] for k in dict.fromkeys(wanted)])
    if country is not None:
        parsed = _parse_bbox(bbox) if bbox is not None else None
        return AttributionResponse(sources=sources_for_region(resolver, country, parsed))
    if bbox is not None:
        raise HTTPException(422, "bbox requires country")
    return AttributionResponse(sources=all_sources(resolver))


@router.get("/{country_code}/profile", response_model=RegionProfile)
async def region_profile(
    country_code: Annotated[str, Path(pattern=_COUNTRY_PATTERN)], resolver: ResolverDep
) -> RegionProfile:
    """Provider chains and map defaults for a country (global profile if it has none)."""
    return resolver.profiles.effective(country_code)
