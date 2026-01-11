"""
Async PostgreSQL Database connection using SQLModel
"""

from typing import AsyncIterator
from contextlib import asynccontextmanager

from sqlmodel import SQLModel
from sqlmodel.ext.asyncio.session import AsyncSession
from sqlalchemy.ext.asyncio import AsyncEngine, async_sessionmaker, create_async_engine

from app.config import SETTINGS


class Database:
    def __init__(self, url: str) -> None:
        self._engine: AsyncEngine = create_async_engine(
            url,
            pool_pre_ping=True,
            echo=False,
            pool_size=5,
            max_overflow=10,
        )
        self._session_factory: async_sessionmaker[AsyncSession] = async_sessionmaker(
            self._engine,
            class_=AsyncSession,
            expire_on_commit=False,
        )

    @property
    def engine(self) -> AsyncEngine:
        return self._engine

    async def init_models(self) -> None:
        """Create all tables"""
        async with self._engine.begin() as conn:
            await conn.run_sync(SQLModel.metadata.create_all)

    async def run_migrations(self) -> None:
        """Run schema migrations (safe to run multiple times)"""
        from sqlalchemy import text

        migrations = [
            # Add 'service' column to checks table
            """
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns
                    WHERE table_name = 'checks' AND column_name = 'service'
                ) THEN
                    ALTER TABLE checks ADD COLUMN service VARCHAR(50) DEFAULT 'ipqs';
                    CREATE INDEX IF NOT EXISTS ix_checks_service ON checks(service);
                END IF;
            END $$;
            """,
            # Make profile_id nullable (for non-IPQS services)
            """
            DO $$
            BEGIN
                ALTER TABLE checks ALTER COLUMN profile_id DROP NOT NULL;
            EXCEPTION
                WHEN others THEN NULL;
            END $$;
            """,
        ]

        async with self._engine.begin() as conn:
            for migration in migrations:
                await conn.execute(text(migration))

    async def dispose(self) -> None:
        """Close all connections"""
        await self._engine.dispose()

    @asynccontextmanager
    async def session(self) -> AsyncIterator[AsyncSession]:
        """Get database session"""
        session = self._session_factory()
        try:
            yield session
        finally:
            await session.close()


# Global database instance
db = Database(SETTINGS.database_url)
