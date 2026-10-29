"""Response models for the imagery endpoints."""

from __future__ import annotations

from pydantic import BaseModel


class ImageryProviderOption(BaseModel):
    """One satellite source that covers a site, as offered in the "Satellite source" choice."""

    key: str
    label: str
    attribution: str
    max_zoom: int


class ImageryProviders(BaseModel):
    """The sources that cover a site, best first; ``default_key`` is the one used unless chosen."""

    default_key: str | None
    providers: list[ImageryProviderOption]


class ImageryMeta(BaseModel):
    """What the map needs to configure the raster source and show attribution.

    When no provider covers the site, ``covered`` is false and the provider fields are null.
    """

    covered: bool
    provider_key: str | None = None
    attribution: str | None = None
    license: str | None = None
    terms_url: str | None = None
    max_zoom: int | None = None
    cacheable: bool | None = None
    tile_url_template: str | None = None
