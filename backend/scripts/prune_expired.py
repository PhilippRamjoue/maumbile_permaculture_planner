"""Count expired cache/auth rows; delete only with explicit --apply. No user data is printed."""

from __future__ import annotations

import argparse
import asyncio
import sys
from datetime import UTC, datetime
from pathlib import Path

from sqlalchemy import delete, func, select

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.db import SessionLocal, engine  # noqa: E402
from app.modules.auth.models import PasswordReset, RefreshToken  # noqa: E402
from app.modules.imagery.models import ImageryTile  # noqa: E402


async def prune(apply: bool) -> None:
    now = datetime.now(UTC)
    async with SessionLocal() as session:
        for model in (RefreshToken, PasswordReset, ImageryTile):
            condition = model.expires_at < now
            count = (
                await session.execute(select(func.count()).select_from(model).where(condition))
            ).scalar_one()
            print(
                f"{model.__tablename__}: {count} expired rows ({'delete' if apply else 'dry run'})"
            )
            if apply:
                await session.execute(delete(model).where(condition))
        if apply:
            await session.commit()
    await engine.dispose()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--apply", action="store_true", help="Delete expired rows; default only counts"
    )
    asyncio.run(prune(parser.parse_args().apply))
