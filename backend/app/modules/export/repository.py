"""Data access for share links: the only layer in this module that touches the session."""

from __future__ import annotations

import uuid

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.export.models import PlanShare


class ExportRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def release_reads(self) -> None:
        await self._session.rollback()

    async def get_by_hash(self, token_hash: str) -> PlanShare | None:
        stmt = select(PlanShare).where(PlanShare.token_hash == token_hash)
        return (await self._session.execute(stmt)).scalar_one_or_none()

    async def get_for_plan(self, plan_id: uuid.UUID) -> PlanShare | None:
        stmt = select(PlanShare).where(PlanShare.plan_id == plan_id)
        return (await self._session.execute(stmt)).scalar_one_or_none()

    async def replace(self, plan_id: uuid.UUID, owner_id: uuid.UUID, token_hash: str) -> PlanShare:
        """Revoke any existing link for the plan and store the new one, atomically."""
        await self._session.execute(delete(PlanShare).where(PlanShare.plan_id == plan_id))
        share = PlanShare(plan_id=plan_id, owner_id=owner_id, token_hash=token_hash)
        self._session.add(share)
        await self._session.commit()
        await self._session.refresh(share)
        return share

    async def delete_for_plan(self, plan_id: uuid.UUID) -> None:
        await self._session.execute(delete(PlanShare).where(PlanShare.plan_id == plan_id))
        await self._session.commit()
