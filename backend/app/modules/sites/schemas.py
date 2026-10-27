"""Request/response models for the sites API."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Annotated, Any

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator

CountryCode = Annotated[str, StringConstraints(pattern=r"^[A-Za-z]{2}$")]
Coordinates = Annotated[list[tuple[float, float]], Field(min_length=3)]


def _check_ranges(coordinates: list[tuple[float, float]]) -> list[tuple[float, float]]:
    for lng, lat in coordinates:
        if not -180.0 <= lng <= 180.0 or not -90.0 <= lat <= 90.0:
            raise ValueError(f"coordinate out of range (expected [lng, lat]): [{lng}, {lat}]")
    return coordinates


class SiteCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    # Omitted -> derived from the boundary centroid (best effort).
    country_code: CountryCode | None = None
    # Ring of [lng, lat] vertices; it is closed automatically if the last point differs.
    coordinates: Coordinates

    _ranges = field_validator("coordinates")(_check_ranges)


class SiteUpdate(BaseModel):
    expected_updated_at: datetime | None = None
    name: str | None = Field(default=None, min_length=1, max_length=200)
    country_code: CountryCode | None = None
    # Replacing the boundary re-computes centroid, bbox, area and UTM zone.
    coordinates: Coordinates | None = None

    @field_validator("coordinates")
    @classmethod
    def _ranges(cls, v: list[tuple[float, float]] | None) -> list[tuple[float, float]] | None:
        return None if v is None else _check_ranges(v)


class SiteRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    owner_id: uuid.UUID | None
    name: str
    country_code: str | None
    boundary: dict[str, Any]  # GeoJSON Polygon
    centroid: dict[str, Any]  # GeoJSON Point
    bbox: list[float]  # [min_lng, min_lat, max_lng, max_lat]
    area_m2: float
    utm_epsg: int
    created_at: datetime
    updated_at: datetime
