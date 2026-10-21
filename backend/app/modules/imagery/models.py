"""Persistent tile cache. Only rows for providers that declare ``cacheable`` ever exist."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, Integer, LargeBinary, SmallInteger, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class ImageryTile(Base):
    __tablename__ = "imagery_tiles"

    # Keyed by provider (not site): sites in the same area share tiles.
    provider_key: Mapped[str] = mapped_column(String(64), primary_key=True)
    z: Mapped[int] = mapped_column(SmallInteger, primary_key=True)
    x: Mapped[int] = mapped_column(Integer, primary_key=True)
    y: Mapped[int] = mapped_column(Integer, primary_key=True)
    content: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    media_type: Mapped[str] = mapped_column(String(64), nullable=False)
    fetched_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
