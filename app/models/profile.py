"""
Profile model - unique device fingerprint profile
"""

from datetime import datetime
from typing import TYPE_CHECKING, List, Optional

from sqlmodel import Field, SQLModel, Relationship, Index
from sqlalchemy import Column, Text

if TYPE_CHECKING:
    from app.models.check import Check


class Profile(SQLModel, table=True):
    __tablename__ = "profiles"

    id: int | None = Field(default=None, primary_key=True)

    # Unique fingerprint hash (SHA256 of canvas|webgl|device_id)
    fingerprint_hash: str = Field(index=True, unique=True, max_length=64)

    # Source fingerprint data
    canvas_hash: str | None = Field(default=None, max_length=64, index=True)
    webgl_hash: str | None = Field(default=None, max_length=64, index=True)
    device_id: str | None = Field(default=None, max_length=128, index=True)

    # Last known data (updated on each check)
    last_ip: str | None = Field(default=None, max_length=45)
    last_country: str | None = Field(default=None, max_length=100)
    last_city: str | None = Field(default=None, max_length=200)
    last_browser: str | None = Field(default=None, max_length=200)
    last_os: str | None = Field(default=None, max_length=100)
    last_fraud_score: int | None = Field(default=None, index=True)

    # Statistics
    check_count: int = Field(default=0, index=True)
    avg_fraud_score: float | None = Field(default=None)
    max_fraud_score: int | None = Field(default=None)
    min_fraud_score: int | None = Field(default=None)

    # Risk flags
    is_flagged: bool = Field(default=False, index=True)
    notes: str | None = Field(default=None, sa_column=Column(Text))

    # Timestamps
    first_seen: datetime = Field(default_factory=datetime.utcnow)
    last_seen: datetime = Field(default_factory=datetime.utcnow, index=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    # Relationships
    checks: List["Check"] = Relationship(back_populates="profile")

    __table_args__ = (
        Index("ix_profiles_canvas_webgl", "canvas_hash", "webgl_hash"),
    )
