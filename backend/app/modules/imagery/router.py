"""Imagery endpoints: tile proxy and metadata for a site."""

from __future__ import annotations

import uuid
from typing import Annotated
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Path, Query, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.modules.imagery.providers import TileFetchError
from app.modules.imagery.repository import TileCacheRepository
from app.modules.imagery.schemas import ImageryMeta, ImageryProviderOption, ImageryProviders
from app.modules.imagery.service import (
    ImageryService,
    NoImageryProviderError,
    TileNotFoundError,
    UnknownImageryProviderError,
)
from app.modules.regions.deps import get_resolver
from app.modules.regions.resolver import RegionResolver
from app.modules.sites.dependencies import OwnedSite

router = APIRouter()

_MAX_ZOOM = 30  # request-shape sanity bound; the provider's own max_zoom is enforced later
_BROWSER_MAX_AGE_CACHEABLE = 86_400
_BROWSER_MAX_AGE_UNCACHEABLE = 3_600


def get_imagery_service(
    session: Annotated[AsyncSession, Depends(get_session)],
    resolver: Annotated[RegionResolver, Depends(get_resolver)],
) -> ImageryService:
    return ImageryService(resolver, TileCacheRepository(session))


ImageryDep = Annotated[ImageryService, Depends(get_imagery_service)]
# Which of the sources covering the site to use; absent means the region profile's first choice.
ProviderQuery = Annotated[str | None, Query(max_length=64)]


@router.get("/{site_id}/imagery/providers", response_model=ImageryProviders)
async def imagery_providers(
    site_id: uuid.UUID, site: OwnedSite, imagery: ImageryDep
) -> ImageryProviders:
    """The satellite sources that cover this site, so the map can offer a choice between them."""
    covering = imagery.covering_providers(site.country_code, site.bbox)
    return ImageryProviders(
        default_key=covering[0].key if covering else None,
        providers=[
            ImageryProviderOption(
                key=p.key,
                label=getattr(p, "label", p.key),
                attribution=p.attribution,
                max_zoom=p.max_zoom,
            )
            for p in covering
        ],
    )


@router.get("/{site_id}/imagery/meta", response_model=ImageryMeta)
async def imagery_meta(
    site_id: uuid.UUID, site: OwnedSite, imagery: ImageryDep, provider: ProviderQuery = None
) -> ImageryMeta:
    """Provider, attribution, license, terms link and max zoom for this site's imagery.

    ``?provider=<key>`` describes (and points the tile template at) another source that covers the
    site; a key that does not is a 400.
    """
    try:
        chosen = imagery.resolve_provider(site.country_code, site.bbox, provider)
    except UnknownImageryProviderError as exc:
        raise HTTPException(400, str(exc)) from exc
    except NoImageryProviderError:
        return ImageryMeta(covered=False)
    # The tile URL carries the choice, so the map and the proxy cannot disagree about the source.
    suffix = f"?provider={quote(chosen.key)}" if provider is not None else ""
    return ImageryMeta(
        covered=True,
        provider_key=chosen.key,
        attribution=chosen.attribution,
        license=chosen.license,
        terms_url=chosen.terms_url,
        max_zoom=chosen.max_zoom,
        cacheable=chosen.cacheable,
        tile_url_template=f"/api/v1/sites/{site_id}/imagery/{{z}}/{{x}}/{{y}}.png{suffix}",
    )


@router.get(
    "/{site_id}/imagery/{z}/{x}/{y}.png",
    response_class=Response,
    responses={200: {"content": {"image/png": {}, "image/jpeg": {}}}},
)
async def imagery_tile(
    site_id: uuid.UUID,
    z: Annotated[int, Path(ge=0, le=_MAX_ZOOM)],
    x: Annotated[int, Path(ge=0)],
    y: Annotated[int, Path(ge=0)],
    site: OwnedSite,
    imagery: ImageryDep,
    provider: ProviderQuery = None,
) -> Response:
    """A tile from the provider resolved for the site's country, fronted by our proxy.

    ``?provider=<key>`` serves another source that covers the site instead; one that does not is
    a 400, never a quiet fallback to a different area's imagery.

    The ``.png`` suffix is the URL convention; the body is whatever the provider serves
    (often JPEG) and ``Content-Type`` says which. ``X-Imagery-Provider`` names the source (its
    attribution is in ``/imagery/meta``) and ``X-Tile-Cache`` is HIT, MISS or BYPASS (the
    provider forbids storing tiles).
    """
    try:
        result = await imagery.tile(site.country_code, site.bbox, z, x, y, provider_key=provider)
    except UnknownImageryProviderError as exc:
        raise HTTPException(400, str(exc)) from exc
    except NoImageryProviderError as exc:
        raise HTTPException(404, "No imagery available for this site") from exc
    except TileNotFoundError as exc:
        raise HTTPException(404, "Tile not available") from exc
    except TileFetchError as exc:
        raise HTTPException(502, "Imagery provider unavailable") from exc

    max_age = (
        _BROWSER_MAX_AGE_CACHEABLE if result.provider.cacheable else _BROWSER_MAX_AGE_UNCACHEABLE
    )
    return Response(
        content=result.data,
        media_type=result.media_type,
        headers={
            "Cache-Control": f"private, max-age={max_age}",
            "X-Imagery-Provider": result.provider.key,
            "X-Tile-Cache": result.cache_status,
        },
    )
