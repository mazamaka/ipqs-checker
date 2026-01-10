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
