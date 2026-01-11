"""
Check model - individual fingerprint check result
"""

from datetime import datetime
from typing import TYPE_CHECKING, Optional, Any

from sqlmodel import Field, SQLModel, Relationship
from sqlalchemy import Column, Text
from sqlalchemy.dialects.postgresql import JSONB

if TYPE_CHECKING:
    from app.models.profile import Profile


class Check(SQLModel, table=True):
    __tablename__ = "checks"

    id: int | None = Field(default=None, primary_key=True)

    # Profile relation (optional for non-IPQS services)
    profile_id: int | None = Field(default=None, foreign_key="profiles.id", index=True)
    profile: Optional["Profile"] = Relationship(back_populates="checks")

    # Service type (ipqs, fingerprint_pro, etc.)
    service: str = Field(default="ipqs", max_length=50, index=True)

    # Session info
    session_id: str = Field(max_length=64, index=True)
    guid: str | None = Field(default=None, max_length=128)

    # IP and location
    ip_address: str | None = Field(default=None, max_length=45, index=True)
    country: str | None = Field(default=None, max_length=100)
    city: str | None = Field(default=None, max_length=200)
    region: str | None = Field(default=None, max_length=200)
    isp: str | None = Field(default=None, max_length=200)
    organization: str | None = Field(default=None, max_length=200)
    asn: str | None = Field(default=None, max_length=50)
    timezone: str | None = Field(default=None, max_length=100)

    # Scores
    fraud_chance: int | None = Field(default=None, index=True)
    guid_confidence: int | None = Field(default=None)

    # Device info
    browser: str | None = Field(default=None, max_length=200)
    operating_system: str | None = Field(default=None, max_length=100)
    true_os: str | None = Field(default=None, max_length=100)
    device_type: str | None = Field(default=None, max_length=50)
    is_mobile: bool | None = Field(default=None)

    # Hardware fingerprints
    canvas_hash: str | None = Field(default=None, max_length=64)
    webgl_hash: str | None = Field(default=None, max_length=64)
    audio_hash: str | None = Field(default=None, max_length=64)
    ssl_hash: str | None = Field(default=None, max_length=64)
    device_id: str | None = Field(default=None, max_length=128)

    # Detections
    proxy: bool | None = Field(default=None)
    vpn: bool | None = Field(default=None)
    tor: bool | None = Field(default=None)
    bot_status: bool | None = Field(default=None)
    is_crawler: bool | None = Field(default=None)
    recent_abuse: bool | None = Field(default=None)
    high_risk_device: bool | None = Field(default=None)
    active_vpn: bool | None = Field(default=None)
    active_tor: bool | None = Field(default=None)

    # Mismatches
    os_mismatch: bool | None = Field(default=None)
    timezone_mismatch: bool | None = Field(default=None)

    # Raw response (full IPQS data)
    raw_response: dict | None = Field(default=None, sa_column=Column(JSONB))

    # Source and metadata
    source: str = Field(default="extension", max_length=50)
    user_agent: str | None = Field(default=None, sa_column=Column(Text))

    # Timestamp
    created_at: datetime = Field(default_factory=datetime.utcnow, index=True)
