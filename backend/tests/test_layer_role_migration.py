"""Exercise the deployed migration against legacy rows in a disposable temporary table."""

import importlib

import pytest
from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import Connection, text
from sqlalchemy.ext.asyncio import create_async_engine

pytestmark = pytest.mark.integration


async def test_layer_role_backfill_preserves_custom_and_duplicate_layers(postgis_url: str) -> None:
    engine = create_async_engine(postgis_url)

    def verify(connection: Connection) -> None:
        # PostgreSQL resolves this session-local table before public.layers. No application
        # tables are reset or downgraded, even inside the disposable test database.
        connection.execute(
            text("""
            CREATE TEMP TABLE layers (
                id uuid PRIMARY KEY, plan_id uuid NOT NULL, name text NOT NULL,
                created_at timestamptz NOT NULL DEFAULT now()
            ) ON COMMIT DROP
        """)
        )
        connection.execute(
            text("""
            INSERT INTO layers (id, plan_id, name) VALUES
            ('00000000-0000-0000-0000-000000000001',
             '11111111-1111-1111-1111-111111111111', 'Zones'),
            ('00000000-0000-0000-0000-000000000002',
             '11111111-1111-1111-1111-111111111111', 'Zones'),
            ('00000000-0000-0000-0000-000000000003',
             '11111111-1111-1111-1111-111111111111', 'Custom')
        """)
        )
        migration = importlib.import_module("app.migrations.versions.0015_layer_roles")
        with Operations.context(MigrationContext.configure(connection)):
            migration.upgrade()
            rows = connection.execute(text("SELECT role FROM layers ORDER BY id")).scalars().all()
            assert rows == ["zone", None, None]
            migration.downgrade()
            assert connection.execute(text("SELECT count(*) FROM layers")).scalar_one() == 3
            columns = list(connection.execute(text("SELECT * FROM layers LIMIT 1")).keys())
            assert "role" not in columns

    try:
        async with engine.begin() as connection:
            await connection.run_sync(verify)
    finally:
        await engine.dispose()
