"""
Analysis engine — Haversine formula, speed calculation, anomaly detection,
and context gathering from external APIs.
"""

import math
import json
import httpx
from datetime import datetime
from typing import List, Dict, Any, Tuple


# ── Haversine Formula ────────────────────────────────────

def haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Calculate the great-circle distance between two points on Earth (in km).
    Uses the Haversine formula accounting for Earth's curvature.
    """
    R = 6371.0  # Earth's radius in kilometers

    lat1_r, lon1_r = math.radians(lat1), math.radians(lon1)
    lat2_r, lon2_r = math.radians(lat2), math.radians(lon2)

    dlat = lat2_r - lat1_r
    dlon = lon2_r - lon1_r

    a = math.sin(dlat / 2) ** 2 + \
        math.cos(lat1_r) * math.cos(lat2_r) * math.sin(dlon / 2) ** 2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

    return R * c


# ── Speed Calculation ────────────────────────────────────

def calculate_speeds(points: List[Dict]) -> List[Dict]:
    """
    Calculate speed (km/h) between consecutive GPS points.
    Returns points with speed_kmh populated.
    """
    if len(points) < 2:
        return points

    for i in range(1, len(points)):
        dist = haversine(
            points[i - 1]["latitude"], points[i - 1]["longitude"],
            points[i]["latitude"], points[i]["longitude"]
        )

        # Parse timestamps
        try:
            t1 = datetime.fromisoformat(points[i - 1]["recorded_at"].replace("Z", "+00:00"))
            t2 = datetime.fromisoformat(points[i]["recorded_at"].replace("Z", "+00:00"))
            dt_hours = (t2 - t1).total_seconds() / 3600.0
        except (ValueError, AttributeError):
            dt_hours = 0

        if dt_hours > 0:
            points[i]["speed_kmh"] = round(dist / dt_hours, 2)
        else:
            points[i]["speed_kmh"] = 0

    # First point gets the same speed as the second
    if len(points) >= 2:
        points[0]["speed_kmh"] = points[1]["speed_kmh"]

    return points


# ── Trip Statistics ──────────────────────────────────────

def compute_trip_stats(points: List[Dict]) -> Dict:
    """Compute total distance, avg speed, max speed, and duration."""
    if len(points) < 2:
        return {
            "total_distance_km": 0,
            "avg_speed_kmh": 0,
            "max_speed_kmh": 0,
            "duration_seconds": 0,
        }

    total_distance = 0
    speeds = []

    for i in range(1, len(points)):
        dist = haversine(
            points[i - 1]["latitude"], points[i - 1]["longitude"],
            points[i]["latitude"], points[i]["longitude"]
        )
        total_distance += dist
        if points[i].get("speed_kmh", 0) > 0:
            speeds.append(points[i]["speed_kmh"])

    try:
        t_start = datetime.fromisoformat(points[0]["recorded_at"].replace("Z", "+00:00"))
        t_end = datetime.fromisoformat(points[-1]["recorded_at"].replace("Z", "+00:00"))
        duration = int((t_end - t_start).total_seconds())
    except (ValueError, AttributeError):
        duration = 0

    avg_speed = sum(speeds) / len(speeds) if speeds else 0
    max_speed = max(speeds) if speeds else 0

    return {
        "total_distance_km": round(total_distance, 3),
        "avg_speed_kmh": round(avg_speed, 2),
        "max_speed_kmh": round(max_speed, 2),
        "duration_seconds": duration,
    }


# ── Anomaly Detection ───────────────────────────────────

def detect_anomalies(points: List[Dict]) -> List[Dict]:
    """
    Flag segments where speed dropped 30%+ below the trimmed baseline average.
    Returns a list of anomaly dicts.
    """
    speeds = [p.get("speed_kmh", 0) for p in points if p.get("speed_kmh", 0) > 0]

    if len(speeds) < 5:
        return []

    # Trimmed mean: exclude top and bottom 10%
    sorted_speeds = sorted(speeds)
    trim = max(1, len(sorted_speeds) // 10)
    trimmed = sorted_speeds[trim:-trim] if trim < len(sorted_speeds) // 2 else sorted_speeds
    baseline = sum(trimmed) / len(trimmed) if trimmed else 0

    if baseline <= 0:
        return []

    threshold = baseline * 0.7  # 30% below baseline
    anomalies = []

    for p in points:
        spd = p.get("speed_kmh", 0)
        if 0 < spd < threshold:
            anomalies.append({
                "latitude": p["latitude"],
                "longitude": p["longitude"],
                "speed_kmh": spd,
                "baseline_speed_kmh": round(baseline, 2),
                "recorded_at": p.get("recorded_at", ""),
            })

    return anomalies


# ── Context Gathering (External APIs) ───────────────────

async def get_elevation(lat: float, lon: float) -> float:
    """Query Open-Meteo API for elevation at a coordinate."""
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                "https://api.open-meteo.com/v1/elevation",
                params={"latitude": lat, "longitude": lon}
            )
            if resp.status_code == 200:
                data = resp.json()
                elevations = data.get("elevation", [0])
                return elevations[0] if elevations else 0
    except Exception:
        pass
    return 0


async def check_intersection(lat: float, lon: float, radius: int = 50) -> Dict:
    """
    Query OSM Overpass API to check if coordinates are near
    a traffic signal or intersection.
    """
    query = f"""
    [out:json][timeout:10];
    (
      node["highway"="traffic_signals"](around:{radius},{lat},{lon});
      node["highway"="stop"](around:{radius},{lat},{lon});
      node["highway"="crossing"](around:{radius},{lat},{lon});
    );
    out count;
    """
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(
                "https://overpass-api.de/api/interpreter",
                data={"data": query}
            )
            if resp.status_code == 200:
                data = resp.json()
                count = data.get("elements", [])
                total = len(count) if isinstance(count, list) else 0
                # Also check the remark for count
                if "remark" in data:
                    return {"near_signal": False, "count": 0}
                return {"near_signal": total > 0, "count": total}
    except Exception:
        pass
    return {"near_signal": False, "count": 0}


# ── Full Analysis Pipeline ──────────────────────────────

async def analyze_trip(points: List[Dict]) -> Dict[str, Any]:
    """
    Full analysis pipeline:
    1. Calculate speeds
    2. Compute stats
    3. Detect anomalies
    4. Gather context (elevation, traffic) for each anomaly
    5. Return structured insights
    """
    # Step 1: Calculate speeds
    points = calculate_speeds(points)

    # Step 2: Compute stats
    stats = compute_trip_stats(points)

    # Step 3: Detect anomalies
    raw_anomalies = detect_anomalies(points)

    # Step 4: Gather context for anomalies (limit to 10 to avoid API spam)
    enriched_anomalies = []
    for anomaly in raw_anomalies[:10]:
        lat, lon = anomaly["latitude"], anomaly["longitude"]

        # Check elevation
        elevation = await get_elevation(lat, lon)

        # Check for nearby intersections/signals
        intersection = await check_intersection(lat, lon)

        # Determine reason
        reason = "unknown"
        detail = ""

        if intersection.get("near_signal"):
            reason = "traffic"
            detail = (
                f"Speed dropped to {anomaly['speed_kmh']:.1f} km/h. "
                f"Reason: Traffic signal or intersection detected nearby "
                f"({intersection['count']} signal(s) within 50m)."
            )
        elif elevation > 0:
            # We'd need elevation at previous point too for grade calculation
            # For MVP, just flag significant elevation
            reason = "elevation"
            detail = (
                f"Speed dropped to {anomaly['speed_kmh']:.1f} km/h. "
                f"Reason: Elevation at {elevation:.0f}m — possible uphill segment."
            )
        else:
            reason = "unknown"
            detail = (
                f"Speed dropped to {anomaly['speed_kmh']:.1f} km/h at "
                f"{anomaly.get('recorded_at', 'unknown time')}. "
                f"Reason: Could not determine — possible rest stop or congestion."
            )

        enriched_anomalies.append({
            "latitude": lat,
            "longitude": lon,
            "speed_kmh": anomaly["speed_kmh"],
            "baseline_speed_kmh": anomaly["baseline_speed_kmh"],
            "reason": reason,
            "detail": detail,
            "occurred_at": anomaly.get("recorded_at", ""),
        })

    return {
        "stats": stats,
        "anomalies": enriched_anomalies,
        "points_with_speed": [
            {
                "lat": p["latitude"],
                "lon": p["longitude"],
                "speed": p.get("speed_kmh", 0),
                "time": p.get("recorded_at", ""),
            }
            for p in points
        ],
    }
