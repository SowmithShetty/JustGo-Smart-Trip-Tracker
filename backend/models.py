"""
Pydantic models for request/response validation.
"""

from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List
from datetime import datetime


# ── Auth Models ──────────────────────────────────────────

class UserCreate(BaseModel):
    username: str = Field(..., min_length=3, max_length=30)
    email: str = Field(..., min_length=5)
    password: str = Field(..., min_length=8)


class UserLogin(BaseModel):
    email: str
    password: str


class GoogleLogin(BaseModel):
    credential: str


class UserResponse(BaseModel):
    id: int
    username: str
    email: str
    units: str
    theme: str
    created_at: str


class UserSettings(BaseModel):
    units: Optional[str] = None
    theme: Optional[str] = None


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


# ── GPS & Trip Models ───────────────────────────────────

class GPSPoint(BaseModel):
    latitude: float = Field(..., ge=-90, le=90)
    longitude: float = Field(..., ge=-180, le=180)
    altitude: Optional[float] = 0
    speed_kmh: Optional[float] = 0
    recorded_at: str
    sequence_order: int


class TripCreate(BaseModel):
    mode: str = Field(default="walk", pattern="^(walk|run|drive)$")
    started_at: str
    ended_at: str
    gps_points: List[GPSPoint]


class AnomalyResponse(BaseModel):
    latitude: float
    longitude: float
    speed_kmh: float
    baseline_speed_kmh: float
    reason: str
    detail: str
    occurred_at: str


class TripResponse(BaseModel):
    id: int
    user_id: int
    mode: str
    total_distance_km: float
    avg_speed_kmh: float
    max_speed_kmh: float
    duration_seconds: int
    started_at: str
    ended_at: str
    insights_json: Optional[str] = "{}"
    created_at: str


class TripDetailResponse(BaseModel):
    trip: TripResponse
    gps_points: List[GPSPoint]
    anomalies: List[AnomalyResponse]
