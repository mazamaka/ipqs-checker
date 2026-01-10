"""
FastAPI dependencies for database access
"""

from typing import AsyncGenerator
from sqlmodel.ext.asyncio.session import AsyncSession
from app.db.database import db


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Dependency for getting database session"""
    async with db.session() as session:
        yield session
