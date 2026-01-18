"""
Check service - CRUD operations for checks
"""

from datetime import datetime
from typing import Optional

from sqlmodel import select, func
from sqlmodel.ext.asyncio.session import AsyncSession

from app.models.profile import Profile
from app.models.check import Check


async def create_check(
    session: AsyncSession,
    profile_id: int,
    data: dict,
    session_id: str,
) -> Check:
    """Create new check record"""

    # Determine OS mismatch
    os_mismatch = False
    true_os = data.get("true_os") or data.get("TrueOS")
    operating_system = data.get("operating_system") or data.get("OperatingSystem")
    if true_os and operating_system:
        os_mismatch = true_os.lower() != operating_system.lower()

    # Determine timezone mismatch
    tz_mismatch = False
    timezone = data.get("timezone") or data.get("Timezone")
    device_timezone = data.get("device_timezone")
    if timezone and device_timezone:
        tz_mismatch = timezone != device_timezone

    check = Check(
        profile_id=profile_id,
        session_id=session_id,
        guid=data.get("guid") or data.get("GUID"),
        ip_address=data.get("ip_address") or data.get("IPAddress"),
        country=data.get("country") or data.get("Country"),
        city=data.get("city") or data.get("City"),
        region=data.get("region") or data.get("Region"),
        isp=data.get("isp") or data.get("ISP"),
        organization=data.get("organization") or data.get("Organization"),
        asn=data.get("asn") or data.get("ASN"),
        timezone=timezone,
        fraud_chance=data.get("fraud_chance") or data.get("FraudChance"),
        guid_confidence=data.get("guid_confidence") or data.get("GUIDConfidence"),
        browser=data.get("browser") or data.get("Browser"),
        operating_system=operating_system,
        true_os=true_os,
        device_type=data.get("device") or data.get("Device"),
        is_mobile=data.get("mobile") or data.get("Mobile"),
        canvas_hash=data.get("canvas_hash") or data.get("CanvasHash"),
        webgl_hash=data.get("webgl_hash") or data.get("WebGLHash"),
        audio_hash=data.get("audio_hash") or data.get("AudioHash"),
        ssl_hash=data.get("ssl_hash") or data.get("SSLHash"),
        device_id=data.get("device_id") or data.get("DeviceID"),
        proxy=data.get("proxy") or data.get("Proxy"),
        vpn=data.get("vpn") or data.get("VPN"),
        tor=data.get("tor") or data.get("TOR"),
        bot_status=data.get("bot_status") or data.get("BotStatus"),
        is_crawler=data.get("is_crawler") or data.get("IsCrawler"),
        recent_abuse=data.get("recent_abuse") or data.get("RecentAbuse"),
        high_risk_device=data.get("high_risk_device") or data.get("HighRiskDevice"),
        active_vpn=data.get("active_vpn") or data.get("ActiveVPN"),
        active_tor=data.get("active_tor") or data.get("ActiveTOR"),
        os_mismatch=os_mismatch,
        timezone_mismatch=tz_mismatch,
        raw_response=data,
        source=data.get("source", "extension"),
        service="ipqs",
    )

    session.add(check)
    await session.commit()
    await session.refresh(check)
    return check


async def get_check_by_session(
    session: AsyncSession,
    session_id: str,
) -> Optional[Check]:
    """Get check by session ID"""
    result = await session.execute(
        select(Check).where(Check.session_id == session_id).order_by(Check.created_at.desc())
    )
    return result.scalars().first()


async def get_profile_checks(
    session: AsyncSession,
    profile_id: int,
    limit: int = 50,
) -> list[Check]:
    """Get checks for a profile"""
    result = await session.execute(
        select(Check)
        .where(Check.profile_id == profile_id)
        .order_by(Check.created_at.desc())
        .limit(limit)
    )
    return list(result.scalars().all())


async def get_recent_checks(
    session: AsyncSession,
    limit: int = 100,
    offset: int = 0,
    service: str | None = None,
) -> list[Check]:
    """Get recent checks with optional service filter"""
    query = select(Check).order_by(Check.created_at.desc())

    if service:
        query = query.where(Check.service == service)

    result = await session.execute(query.offset(offset).limit(limit))
    return list(result.scalars().all())


async def get_checks_count(session: AsyncSession, service: str | None = None) -> int:
    """Get total checks count with optional service filter"""
    query = select(func.count(Check.id))
    if service:
        query = query.where(Check.service == service)
    result = await session.execute(query)
    return result.scalar() or 0


async def get_stats(session: AsyncSession) -> dict:
    """Get overall statistics"""
    # Profiles count
    profiles_count = (await session.execute(
        select(func.count(Profile.id))
    )).scalar() or 0

    # Checks count
    checks_count = (await session.execute(
        select(func.count(Check.id))
    )).scalar() or 0

    # Avg fraud score
    avg_fraud = (await session.execute(
        select(func.avg(Check.fraud_chance))
    )).scalar() or 0

    # High risk profiles (fraud > 70)
    high_risk = (await session.execute(
        select(func.count(Profile.id)).where(Profile.last_fraud_score > 70)
    )).scalar() or 0

    # Medium risk profiles (fraud 30-70)
    medium_risk = (await session.execute(
        select(func.count(Profile.id)).where(
            Profile.last_fraud_score.between(30, 70)
        )
    )).scalar() or 0

    # Low risk profiles (fraud < 30)
    low_risk = (await session.execute(
        select(func.count(Profile.id)).where(
            Profile.last_fraud_score < 30,
            Profile.last_fraud_score.isnot(None)
        )
    )).scalar() or 0

    # Unique IPs
    unique_ips = (await session.execute(
        select(func.count(func.distinct(Check.ip_address)))
    )).scalar() or 0

    # Flagged profiles
    flagged_count = (await session.execute(
        select(func.count(Profile.id)).where(Profile.is_flagged == True)
    )).scalar() or 0

    # Countries distribution
    countries_result = await session.execute(
        select(Check.country, func.count(Check.id).label("cnt"))
        .where(Check.country.isnot(None))
        .group_by(Check.country)
        .order_by(func.count(Check.id).desc())
        .limit(10)
    )
    countries = {row.country: row.cnt for row in countries_result}

    # Detection rates
    proxy_count = (await session.execute(
        select(func.count(Check.id)).where(Check.proxy == True)
    )).scalar() or 0

    vpn_count = (await session.execute(
        select(func.count(Check.id)).where(Check.vpn == True)
    )).scalar() or 0

    bot_count = (await session.execute(
        select(func.count(Check.id)).where(Check.bot_status == True)
    )).scalar() or 0

    # Stats by service
    ipqs_count = (await session.execute(
        select(func.count(Check.id)).where(Check.service == "ipqs")
    )).scalar() or 0

    fp_count = (await session.execute(
        select(func.count(Check.id)).where(Check.service == "fingerprint_pro")
    )).scalar() or 0

    creepjs_count = (await session.execute(
        select(func.count(Check.id)).where(Check.service == "creepjs")
    )).scalar() or 0

    # FP Pro specific: anti-detect browser detected count
    # We need to check raw_response for this
    fp_antidetect_count = 0
    try:
        from sqlalchemy import cast, String
        from sqlalchemy.dialects.postgresql import JSONB

        fp_antidetect_result = await session.execute(
            select(func.count(Check.id)).where(
                Check.service == "fingerprint_pro",
                Check.raw_response["summary"]["anti_detect_browser"].astext == "true"
            )
        )
        fp_antidetect_count = fp_antidetect_result.scalar() or 0
    except Exception:
        pass  # Skip if JSON query fails

    return {
        "profiles_count": profiles_count,
        "checks_count": checks_count,
        "avg_fraud_score": round(avg_fraud, 1) if avg_fraud else 0,
        "high_risk_profiles": high_risk,
        "medium_risk_profiles": medium_risk,
        "low_risk_profiles": low_risk,
        "unique_ips": unique_ips,
        "flagged_profiles": flagged_count,
        "countries": countries,
        "detections": {
            "proxy": proxy_count,
            "vpn": vpn_count,
            "bot": bot_count,
        },
        "services": {
            "ipqs": ipqs_count,
            "fingerprint_pro": fp_count,
            "creepjs": creepjs_count,
            "fp_antidetect": fp_antidetect_count,
        },
    }
