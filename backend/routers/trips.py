"""
Trips router — Create, list, get details, and delete trips.
"""

import json
from fastapi import APIRouter, Depends, HTTPException, Header
from typing import Optional
import aiosqlite

from database import get_db
from models import TripCreate, TripResponse, TripDetailResponse, GPSPoint, AnomalyResponse
from routers.auth import extract_token
from analysis import analyze_trip

router = APIRouter(prefix="/api/trips", tags=["trips"])


@router.post("", response_model=TripResponse)
async def create_trip(
    data: TripCreate,
    authorization: str = Header(""),
    db: aiosqlite.Connection = Depends(get_db)
):
    """
    Submit a completed trip with GPS data.
    Triggers the analysis engine and stores results.
    """
    user_id = extract_token(authorization)

    # Convert GPS points to dicts for analysis
    points_dicts = [
        {
            "latitude": p.latitude,
            "longitude": p.longitude,
            "altitude": p.altitude or 0,
            "speed_kmh": p.speed_kmh or 0,
            "recorded_at": p.recorded_at,
            "sequence_order": p.sequence_order,
        }
        for p in data.gps_points
    ]

    # Run the analysis engine
    analysis = await analyze_trip(points_dicts)
    stats = analysis["stats"]

    # Insert the trip
    cursor = await db.execute(
        """INSERT INTO trips
           (user_id, mode, total_distance_km, avg_speed_kmh, max_speed_kmh,
            duration_seconds, started_at, ended_at, insights_json)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            user_id, data.mode,
            stats["total_distance_km"], stats["avg_speed_kmh"],
            stats["max_speed_kmh"], stats["duration_seconds"],
            data.started_at, data.ended_at,
            json.dumps(analysis),
        )
    )
    trip_id = cursor.lastrowid

    # Insert GPS points
    for p in data.gps_points:
        await db.execute(
            """INSERT INTO gps_points
               (trip_id, latitude, longitude, altitude, speed_kmh,
                recorded_at, sequence_order)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (trip_id, p.latitude, p.longitude, p.altitude or 0,
             p.speed_kmh or 0, p.recorded_at, p.sequence_order)
        )

    # Insert anomalies
    for a in analysis.get("anomalies", []):
        await db.execute(
            """INSERT INTO anomalies
               (trip_id, latitude, longitude, speed_kmh, baseline_speed_kmh,
                reason, detail, occurred_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (trip_id, a["latitude"], a["longitude"], a["speed_kmh"],
             a["baseline_speed_kmh"], a["reason"], a["detail"],
             a.get("occurred_at", ""))
        )

    await db.commit()

    # Fetch and return the created trip
    cursor = await db.execute("SELECT * FROM trips WHERE id = ?", (trip_id,))
    trip = await cursor.fetchone()

    return TripResponse(
        id=trip["id"],
        user_id=trip["user_id"],
        mode=trip["mode"],
        total_distance_km=trip["total_distance_km"],
        avg_speed_kmh=trip["avg_speed_kmh"],
        max_speed_kmh=trip["max_speed_kmh"],
        duration_seconds=trip["duration_seconds"],
        started_at=str(trip["started_at"]),
        ended_at=str(trip["ended_at"]),
        insights_json=trip["insights_json"],
        created_at=str(trip["created_at"]),
    )


@router.get("", response_model=list[TripResponse])
async def list_trips(
    authorization: str = Header(""),
    db: aiosqlite.Connection = Depends(get_db)
):
    """List all trips for the authenticated user, newest first."""
    user_id = extract_token(authorization)

    cursor = await db.execute(
        "SELECT * FROM trips WHERE user_id = ? ORDER BY created_at DESC",
        (user_id,)
    )
    rows = await cursor.fetchall()

    return [
        TripResponse(
            id=r["id"],
            user_id=r["user_id"],
            mode=r["mode"],
            total_distance_km=r["total_distance_km"],
            avg_speed_kmh=r["avg_speed_kmh"],
            max_speed_kmh=r["max_speed_kmh"],
            duration_seconds=r["duration_seconds"],
            started_at=str(r["started_at"]),
            ended_at=str(r["ended_at"]),
            insights_json=r["insights_json"],
            created_at=str(r["created_at"]),
        )
        for r in rows
    ]


@router.get("/{trip_id}")
async def get_trip(
    trip_id: int,
    authorization: str = Header(""),
    db: aiosqlite.Connection = Depends(get_db)
):
    """Get full trip details including GPS points and anomalies."""
    user_id = extract_token(authorization)

    # Fetch trip
    cursor = await db.execute(
        "SELECT * FROM trips WHERE id = ? AND user_id = ?",
        (trip_id, user_id)
    )
    trip = await cursor.fetchone()
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")

    # Fetch GPS points
    cursor = await db.execute(
        "SELECT * FROM gps_points WHERE trip_id = ? ORDER BY sequence_order",
        (trip_id,)
    )
    points = await cursor.fetchall()

    # Fetch anomalies
    cursor = await db.execute(
        "SELECT * FROM anomalies WHERE trip_id = ?",
        (trip_id,)
    )
    anomalies_rows = await cursor.fetchall()

    return {
        "trip": {
            "id": trip["id"],
            "user_id": trip["user_id"],
            "mode": trip["mode"],
            "total_distance_km": trip["total_distance_km"],
            "avg_speed_kmh": trip["avg_speed_kmh"],
            "max_speed_kmh": trip["max_speed_kmh"],
            "duration_seconds": trip["duration_seconds"],
            "started_at": str(trip["started_at"]),
            "ended_at": str(trip["ended_at"]),
            "insights_json": trip["insights_json"],
            "created_at": str(trip["created_at"]),
        },
        "gps_points": [
            {
                "latitude": p["latitude"],
                "longitude": p["longitude"],
                "altitude": p["altitude"],
                "speed_kmh": p["speed_kmh"],
                "recorded_at": str(p["recorded_at"]),
                "sequence_order": p["sequence_order"],
            }
            for p in points
        ],
        "anomalies": [
            {
                "latitude": a["latitude"],
                "longitude": a["longitude"],
                "speed_kmh": a["speed_kmh"],
                "baseline_speed_kmh": a["baseline_speed_kmh"],
                "reason": a["reason"],
                "detail": a["detail"],
                "occurred_at": str(a["occurred_at"]),
            }
            for a in anomalies_rows
        ],
    }


@router.delete("/{trip_id}")
async def delete_trip(
    trip_id: int,
    authorization: str = Header(""),
    db: aiosqlite.Connection = Depends(get_db)
):
    """Delete a trip and all associated data."""
    user_id = extract_token(authorization)

    cursor = await db.execute(
        "SELECT id FROM trips WHERE id = ? AND user_id = ?",
        (trip_id, user_id)
    )
    trip = await cursor.fetchone()
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")

    await db.execute("DELETE FROM anomalies WHERE trip_id = ?", (trip_id,))
    await db.execute("DELETE FROM gps_points WHERE trip_id = ?", (trip_id,))
    await db.execute("DELETE FROM trips WHERE id = ?", (trip_id,))
    await db.commit()

    return {"message": "Trip deleted successfully"}
