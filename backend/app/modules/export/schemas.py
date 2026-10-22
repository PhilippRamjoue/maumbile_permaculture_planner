"""Response models for the share-link endpoints (typed on the frontend via generated contracts)."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class ShareCreated(BaseModel):
    """A new read-only link. ``token`` is shown once; only its hash is stored."""

    token: str
    created_at: datetime


class ShareStatus(BaseModel):
    shared: bool
    created_at: datetime | None = None
