"""
Profile service - CRUD operations for profiles
"""

import hashlib
from datetime import datetime
from typing import Optional

from sqlmodel import select, func
from sqlmodel.ext.asyncio.session import AsyncSession

from app.models.profile import Profile
from app.models.check import Check


def generate_fingerprint_hash(
    canvas_hash: str | None,
    webgl_hash: str | None,
    device_id: str | None,
) -> str:
    """Generate unique hash for profile identification"""
    parts = [canvas_hash or "", webgl_hash or "", device_id or ""]
    combined = "|".join(parts)
    return hashlib.sha256(combined.encode()).hexdigest()[:32]


async def get_or_create_profile(
    session: AsyncSession,
    canvas_hash: str | None,
    webgl_hash: str | None,
    device_id: str | None,
) -> Profile:
    """Get existing profile or create new one"""
    fp_hash = generate_fingerprint_hash(canvas_hash, webgl_hash, device_id)

    result = await session.execute(
        select(Profile).where(Profile.fingerprint_hash == fp_hash)
    )
    profile = result.scalar_one_or_none()

    if not profile:
        profile = Profile(
            fingerprint_hash=fp_hash,
            canvas_hash=canvas_hash,
            webgl_hash=webgl_hash,
            device_id=device_id,
        )
        session.add(profile)
        await session.commit()
        await session.refresh(profile)

    return profile


async def update_profile_from_check(
    session: AsyncSession,
    profile: Profile,
    check_data: dict,
) -> None:
    """Update profile with data from latest check"""
    profile.last_ip = check_data.get("ip_address")
    profile.last_country = check_data.get("country")
    profile.last_city = check_data.get("city")
    profile.last_browser = check_data.get("browser")
    profile.last_os = check_data.get("operating_system")
    profile.last_fraud_score = check_data.get("fraud_chance")
    profile.check_count += 1
    profile.last_seen = datetime.utcnow()
    profile.updated_at = datetime.utcnow()

    # Recalculate statistics
    result = await session.execute(
        select(
            func.avg(Check.fraud_chance).label("avg"),
            func.max(Check.fraud_chance).label("max"),
            func.min(Check.fraud_chance).label("min"),
        ).where(Check.profile_id == profile.id)
    )
    stats = result.one_or_none()
    if stats:
        profile.avg_fraud_score = round(stats.avg, 1) if stats.avg else None
        profile.max_fraud_score = stats.max
        profile.min_fraud_score = stats.min

    await session.commit()


async def get_profile_by_id(
    session: AsyncSession,
    profile_id: int,
) -> Optional[Profile]:
    """Get profile by ID"""
    result = await session.execute(
        select(Profile).where(Profile.id == profile_id)
    )
    return result.scalar_one_or_none()


async def get_profiles(
    session: AsyncSession,
    limit: int = 50,
    offset: int = 0,
    order_by: str = "last_seen",
    search: str | None = None,
    flagged_only: bool = False,
) -> tuple[list[Profile], int]:
    """Get profiles with pagination and filtering"""
    query = select(Profile)

    # Filter by flagged
    if flagged_only:
        query = query.where(Profile.is_flagged == True)

    # Search
    if search:
        search_pattern = f"%{search}%"
        query = query.where(
            Profile.last_ip.ilike(search_pattern) |
            Profile.device_id.ilike(search_pattern) |
            Profile.fingerprint_hash.ilike(search_pattern) |
            Profile.last_country.ilike(search_pattern)
        )

    # Order
    if order_by == "fraud_score":
        query = query.order_by(Profile.last_fraud_score.desc().nullslast())
    elif order_by == "check_count":
        query = query.order_by(Profile.check_count.desc())
    elif order_by == "first_seen":
        query = query.order_by(Profile.first_seen.desc())
    else:  # last_seen (default)
        query = query.order_by(Profile.last_seen.desc())

    # Count total
    count_query = select(func.count()).select_from(query.subquery())
    total = (await session.execute(count_query)).scalar() or 0

    # Paginate
    query = query.offset(offset).limit(limit)
    result = await session.execute(query)
    profiles = list(result.scalars().all())

    return profiles, total


async def update_profile_flag(
    session: AsyncSession,
    profile_id: int,
    is_flagged: bool,
    notes: str | None = None,
) -> Optional[Profile]:
    """Update profile flag status"""
    profile = await get_profile_by_id(session, profile_id)
    if profile:
        profile.is_flagged = is_flagged
        if notes is not None:
            profile.notes = notes
        profile.updated_at = datetime.utcnow()
        await session.commit()
    return profile
