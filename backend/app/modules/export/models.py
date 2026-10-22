"""ORM model for plan share links."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class PlanShare(Base):
    """A read-only share link: a secret token that lets its holder export one plan.

    Only the SHA-256 of the token is stored. ``owner_id`` records who granted it: the link
    acts with that user's read access, so it stops working if the site changes hands or the
    plan/site is deleted.
    """

    __tablename__ = "plan_shares"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    # One active link per plan: creating a new link replaces (revokes) the previous one.
    plan_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("plans.id", ondelete="CASCADE"), nullable=False, unique=True
    )
    owner_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False)
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
