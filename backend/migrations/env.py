"""
Alembic Environment — Warp Ladger
Async migration runner using asyncpg.
"""
import asyncio
from logging.config import fileConfig

from alembic import context
from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config

# Load app models so autogenerate can see all tables
from app.database import Base  # noqa: F401 — registers all metadata

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def get_url() -> str:
    """Read DATABASE_URL from environment (overrides alembic.ini).

    The async migration engine (async_engine_from_config) requires asyncpg,
    so we must keep the +asyncpg driver specifier.  If DATABASE_URL was set
    with a bare 'postgresql://' URL (no driver suffix), we add +asyncpg so
    that the async engine can connect correctly.
    """
    import os

    url = os.environ.get("DATABASE_URL", "")
    if not url:
        # Fall back to alembic.ini sqlalchemy.url – returned as-is so
        # alembic's own config loading can handle it.
        return url
    # Normalise: bare postgresql:// → postgresql+asyncpg://
    if url.startswith("postgresql://") and "+asyncpg" not in url:
        url = url.replace("postgresql://", "postgresql+asyncpg://", 1)
    # Also handle postgresql+psycopg2:// → postgresql+asyncpg://
    if "postgresql+psycopg2://" in url:
        url = url.replace("postgresql+psycopg2://", "postgresql+asyncpg://", 1)
    return url


def run_migrations_offline() -> None:
    url = get_url()
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: Connection) -> None:
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    configuration = config.get_section(config.config_ini_section, {})
    configuration["sqlalchemy.url"] = get_url()

    connectable = async_engine_from_config(
        configuration,
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)

    await connectable.dispose()


def run_migrations_online() -> None:
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
