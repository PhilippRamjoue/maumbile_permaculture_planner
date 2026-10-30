"""Business logic for exporting and sharing plans. No FastAPI imports.

Plan data comes through the ``PlanSource`` port (implemented in ``access.py`` on top of the
planning and sites services), so this module never reaches into their repositories or models.
A share link is a secret token that acts with its grantor's read access; only its hash is stored.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import re
import secrets
import unicodedata
import uuid
from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Literal, Protocol

from app.core.capacity import Capacity
from app.modules.export.bundle import BUNDLE_VERSION, SiteBundle, build_bundle
from app.modules.export.document import PlanDocument
from app.modules.export.geojson import plan_to_geojson
from app.modules.export.render import LabelMode, render_pdf, render_png
from app.modules.export.repository import ExportRepository

ExportFormat = Literal["geojson", "png", "pdf"]
MEDIA_TYPES: dict[str, str] = {
    "geojson": "application/geo+json",
    "png": "image/png",
    "pdf": "application/pdf",
}
_render_capacity = Capacity(2)


class ExportError(Exception):
    """Base class for domain errors raised by the export service."""


class PlanNotFoundError(ExportError):
    """No such plan (or it is deleted)."""


class PlanForbiddenError(ExportError):
    """The caller does not own the plan's site."""


class ShareNotFoundError(ExportError):
    """Unknown, revoked or no-longer-valid share token."""


class InvalidBundleError(ExportError):
    """A site import bundle is unsupported or fails validation."""


class PlanSource(Protocol):
    """Port to the planning and sites modules, acting as ``owner_id``.

    Raise ``PlanNotFoundError`` / ``PlanForbiddenError`` unless the caller may read the plan.
    """

    async def ensure_owner(self, plan_id: uuid.UUID, owner_id: uuid.UUID) -> None: ...

    async def load(self, plan_id: uuid.UUID, owner_id: uuid.UUID) -> PlanDocument: ...

    async def load_site(self, site_id: uuid.UUID, owner_id: uuid.UUID) -> SiteContent: ...

    async def import_site(self, owner_id: uuid.UUID, bundle: SiteBundle) -> ImportedSite: ...


@dataclass(frozen=True)
class ExportedFile:
    content: bytes
    media_type: str
    filename: str


@dataclass(frozen=True)
class ShareLink:
    token: str
    created_at: datetime


@dataclass(frozen=True)
class SiteContent:
    """A site and its plans, read for an export bundle."""

    name: str
    country_code: str | None
    boundary: dict[str, Any]
    docs: list[PlanDocument]


@dataclass(frozen=True)
class ImportedSite:
    """The new site an import created."""

    id: uuid.UUID
    name: str


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def filename_for(name: str, fmt: str) -> str:
    """An ASCII-safe download name such as ``master-plan.png``."""
    ascii_name = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    slug = re.sub(r"[^a-z0-9]+", "-", ascii_name.lower()).strip("-")[:60] or "plan"
    return f"{slug}.{fmt}"


def _render(doc: PlanDocument, fmt: ExportFormat, labels: LabelMode) -> bytes:
    if fmt == "png":
        return render_png(doc, labels)
    if fmt == "pdf":
        return render_pdf(doc, labels)
    return json.dumps(plan_to_geojson(doc), ensure_ascii=False, indent=2).encode()


class ExportService:
    def __init__(
        self,
        repo: ExportRepository,
        plans: PlanSource,
        new_token: Callable[[], str] = lambda: secrets.token_urlsafe(32),
    ) -> None:
        self._repo = repo
        self._plans = plans
        self._new_token = new_token

    async def _file(self, doc: PlanDocument, fmt: ExportFormat, labels: LabelMode) -> ExportedFile:
        # Rendering is CPU-bound; keep it off the event loop.
        await self._repo.release_reads()
        async with _render_capacity.acquire():
            content = await asyncio.to_thread(_render, doc, fmt, labels)
        return ExportedFile(content, MEDIA_TYPES[fmt], filename_for(doc.name, fmt))

    async def export(
        self, plan_id: uuid.UUID, owner_id: uuid.UUID, fmt: ExportFormat, labels: LabelMode = "tidy"
    ) -> ExportedFile:
        return await self._file(await self._plans.load(plan_id, owner_id), fmt, labels)

    # ── whole-site portable bundle ───────────────────────────────────────────────────────────
    async def export_site_bundle(self, site_id: uuid.UUID, owner_id: uuid.UUID) -> ExportedFile:
        """A downloadable JSON bundle of a site and all its plans (an editable copy)."""
        content = await self._plans.load_site(site_id, owner_id)
        bundle = build_bundle(
            site_name=content.name,
            country_code=content.country_code,
            boundary=content.boundary,
            docs=content.docs,
        )
        body = bundle.model_dump_json(indent=2).encode()
        return ExportedFile(body, "application/json", filename_for(content.name, "maumbile.json"))

    async def import_site(self, owner_id: uuid.UUID, bundle: SiteBundle) -> ImportedSite:
        """Create a new site owned by ``owner_id`` from a bundle (fresh ids throughout)."""
        if bundle.bundle_version != BUNDLE_VERSION:
            raise InvalidBundleError(
                f"Unsupported bundle_version {bundle.bundle_version}; expected {BUNDLE_VERSION}."
            )
        return await self._plans.import_site(owner_id, bundle)

    # ── share links ────────────────────────────────────────────────────────────────────────
    async def create_share(self, plan_id: uuid.UUID, owner_id: uuid.UUID) -> ShareLink:
        """Create a link (revoking the plan's previous one). The token is returned only once."""
        await self._plans.ensure_owner(plan_id, owner_id)
        token = self._new_token()
        share = await self._repo.replace(plan_id, owner_id, hash_token(token))
        return ShareLink(token, share.created_at)

    async def share_created_at(self, plan_id: uuid.UUID, owner_id: uuid.UUID) -> datetime | None:
        await self._plans.ensure_owner(plan_id, owner_id)
        share = await self._repo.get_for_plan(plan_id)
        return None if share is None else share.created_at

    async def revoke_share(self, plan_id: uuid.UUID, owner_id: uuid.UUID) -> None:
        await self._plans.ensure_owner(plan_id, owner_id)
        await self._repo.delete_for_plan(plan_id)

    async def export_shared(
        self, token: str, fmt: ExportFormat, labels: LabelMode = "tidy"
    ) -> ExportedFile:
        """Export via a share token, with the grantor's read access (never write access)."""
        share = await self._repo.get_by_hash(hash_token(token))
        if share is None:
            raise ShareNotFoundError
        try:
            doc = await self._plans.load(share.plan_id, share.owner_id)
        except (PlanNotFoundError, PlanForbiddenError):
            # The plan was deleted or the site changed hands: the link silently stops working.
            raise ShareNotFoundError from None
        return await self._file(doc, fmt, labels)
