"""Response models for the share-link endpoints (typed on the frontend via generated contracts)."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel


class SiteImported(BaseModel):
    """The new site an import created; the frontend navigates to it."""

    id: uuid.UUID
    name: str


class ShareCreated(BaseModel):
    """A new read-only link. ``token`` is shown once; only its hash is stored."""

    token: str
    created_at: datetime


class ShareStatus(BaseModel):
    shared: bool
    created_at: datetime | None = None
