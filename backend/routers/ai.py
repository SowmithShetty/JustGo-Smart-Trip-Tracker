"""
AI Coach router — Gemini-powered personalized trip coaching.
Analyzes trip metrics and anomalies to provide actionable insights.
"""

import os
import json
import time
from collections import defaultdict
from fastapi import APIRouter, Depends, HTTPException, Header
import aiosqlite

from database import get_db
from routers.auth import extract_token
from models import TripAnalyzeRequest

router = APIRouter(prefix="/api/ai", tags=["ai"])

# ── Simple In-Memory Rate Limiter ────────────────────
# Max 10 AI requests per user per hour
_rate_limits = defaultdict(list)
RATE_LIMIT_MAX = 10
RATE_LIMIT_WINDOW = 3600  # 1 hour in seconds


def _check_rate_limit(user_id: int):
    """Check and enforce per-user rate limiting."""
    now = time.time()
    # Clean old entries
    _rate_limits[user_id] = [t for t in _rate_limits[user_id] if now - t < RATE_LIMIT_WINDOW]
    if len(_rate_limits[user_id]) >= RATE_LIMIT_MAX:
        raise HTTPException(
            status_code=429,
            detail=f"Rate limit reached. You can make {RATE_LIMIT_MAX} AI coaching requests per hour. Please try again later."
        )
    _rate_limits[user_id].append(now)


def _row_to_dict(row):
    """Convert an aiosqlite Row to a dict."""
    if row is None:
        return None
    return dict(row)


# ── Prompt Construction ──────────────────────────────

def _build_coaching_prompt(trip: dict, points: list, anomalies: list) -> str:
    """Build a detailed prompt for the Gemini model."""

    mode = trip.get("mode", "walk")
    distance_km = trip.get("total_distance_km", 0)
    avg_speed = trip.get("avg_speed_kmh", 0)
    max_speed = trip.get("max_speed_kmh", 0)
    duration_s = trip.get("duration_seconds", 0)
    started_at = trip.get("started_at", "")
    ended_at = trip.get("ended_at", "")

    # Format duration
    hours = duration_s // 3600
    minutes = (duration_s % 3600) // 60
    seconds = duration_s % 60
    duration_str = ""
    if hours > 0:
        duration_str += f"{hours}h "
    if minutes > 0:
        duration_str += f"{minutes}m "
    duration_str += f"{seconds}s"

    # Speed statistics from points
    speeds = [p.get("speed_kmh", 0) for p in points if p.get("speed_kmh", 0) > 0]
    speed_variance = 0
    if len(speeds) > 1:
        mean_spd = sum(speeds) / len(speeds)
        speed_variance = sum((s - mean_spd) ** 2 for s in speeds) / len(speeds)

    # Build anomaly descriptions
    anomaly_text = ""
    if anomalies:
        anomaly_text = f"\n\nSPEED ANOMALIES DETECTED ({len(anomalies)} total):\n"
        for i, a in enumerate(anomalies[:8], 1):
            anomaly_text += (
                f"  {i}. Speed dropped to {a.get('speed_kmh', 0):.1f} km/h "
                f"(baseline was {a.get('baseline_speed_kmh', 0):.1f} km/h). "
                f"Reason: {a.get('reason', 'unknown')}. "
                f"Detail: {a.get('detail', 'No detail available')}.\n"
            )
    else:
        anomaly_text = "\n\nNo speed anomalies detected — the pace was consistent throughout."

    prompt = f"""You are an expert sports coach and travel analyst AI for "JustGo", a smart GPS trip tracker app.

Analyze this trip and provide personalized coaching feedback. Be encouraging, specific, and data-driven.

TRIP DATA:
- Mode: {mode}
- Total Distance: {distance_km:.2f} km
- Duration: {duration_str} ({duration_s} seconds)
- Average Speed: {avg_speed:.2f} km/h
- Maximum Speed: {max_speed:.2f} km/h
- Speed Variance: {speed_variance:.2f}
- GPS Points Recorded: {len(points)}
- Start Time: {started_at}
- End Time: {ended_at}
{anomaly_text}

RESPONSE FORMAT — You MUST respond with valid JSON only, no markdown, no code fences. Use this exact structure:
{{
  "performance": "2-3 sentence performance summary. How did this trip go overall? Reference specific numbers.",
  "pace": "2-3 sentences analyzing pacing consistency and speed patterns. Was the pace steady or variable?",
  "slowdowns": "2-3 sentences about any slowdowns/anomalies. Explain WHY they happened in a helpful, non-judgmental way. If none, praise the consistency.",
  "tips": "2-3 actionable tips specific to this trip's mode ({mode}) and data. Be concrete, not generic.",
  "goal": "1-2 sentences suggesting a specific, achievable goal for the next {mode} trip. Use exact numbers based on this trip's data."
}}

IMPORTANT RULES:
- Respond ONLY with raw JSON. No markdown formatting, no backticks, no explanation outside the JSON.
- Keep each field to 2-3 sentences maximum.
- Use the actual trip numbers in your analysis — don't be vague.
- For {mode} mode, use appropriate context (walking pace vs running pace vs driving speed).
- Be motivational but honest. Celebrate achievements, kindly address areas for improvement.
- If speed variance is low, praise consistency. If high, suggest pacing strategies.
"""
    return prompt


def _generate_fallback_coaching(trip: dict, points: list, anomalies: list) -> dict:
    """Generate high-quality rule-based coaching when Gemini API is unavailable or invalid."""
    mode = trip.get("mode", "walk")
    dist = trip.get("total_distance_km", 0)
    avg_spd = trip.get("avg_speed_kmh", 0)
    max_spd = trip.get("max_speed_kmh", 0)
    duration_s = trip.get("duration_seconds", 0)

    # Format duration
    mins = duration_s // 60
    secs = duration_s % 60
    time_str = f"{mins}m {secs}s" if mins > 0 else f"{secs}s"

    performance = (
        f"You logged a {dist:.2f} km {mode} in {time_str} with an average speed of {avg_spd:.1f} km/h "
        f"and reached a peak speed of {max_spd:.1f} km/h. Solid effort completing this trip!"
    )

    if avg_spd > 0 and mode != "drive":
        pace_min = (duration_s / 60) / max(dist, 0.01)
        pace_str = f"{int(pace_min)}:{int((pace_min % 1) * 60):02d} min/km"
        pace = f"Your average pace was {pace_str}. Speed consistency was maintained across the route."
    else:
        pace = f"Average travel speed was {avg_spd:.1f} km/h with consistent rhythm across recorded checkpoints."

    if anomalies and len(anomalies) > 0:
        slowdowns = f"Recorded {len(anomalies)} speed anomaly or slowdown segment(s), likely from traffic signals, turns, or brief rest stops."
    else:
        slowdowns = "Zero significant slowdowns detected along your route — smooth, continuous momentum throughout!"

    if mode == "walk":
        tips = "Incorporate 2-minute power walking intervals to elevate heart rate and maximize cardiovascular benefits."
    elif mode == "run":
        tips = "Focus on a consistent cadence (around 165-175 SPM) and maintain controlled breathing across elevations."
    else:
        tips = "Smooth accelerator modulation and anticipation of stops improves efficiency and reduces vehicle wear."

    next_dist = round(dist * 1.15, 1) if dist > 0 else 2.0
    goal = f"Aim for {next_dist} km on your next {mode} session to keep building endurance!"

    return {
        "performance": performance,
        "pace": pace,
        "slowdowns": slowdowns,
        "tips": tips,
        "goal": goal,
    }


# ── AI Coaching Endpoint ─────────────────────────────

@router.get("/coach/{trip_id}")
async def get_ai_coaching(
    trip_id: int,
    authorization: str = Header(""),
    db: aiosqlite.Connection = Depends(get_db),
):
    """
    Generate AI coaching insights for a specific trip.
    Uses Google Gemini 2.0 Flash to analyze trip data with offline analytics fallback.
    """
    user_id = extract_token(authorization)

    # Rate limit check
    _check_rate_limit(user_id)

    api_key = os.getenv("GEMINI_API_KEY")

    # Fetch trip
    cursor = await db.execute(
        "SELECT * FROM trips WHERE id = ? AND user_id = ?",
        (trip_id, user_id),
    )
    trip = _row_to_dict(await cursor.fetchone())
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")

    # Fetch GPS points
    cursor = await db.execute(
        "SELECT latitude, longitude, altitude, speed_kmh, recorded_at, sequence_order "
        "FROM gps_points WHERE trip_id = ? ORDER BY sequence_order",
        (trip_id,),
    )
    points = [
        {
            "latitude": p["latitude"],
            "longitude": p["longitude"],
            "altitude": p["altitude"],
            "speed_kmh": p["speed_kmh"],
            "recorded_at": str(p["recorded_at"]),
            "sequence_order": p["sequence_order"],
        }
        for p in await cursor.fetchall()
    ]

    # Fetch anomalies
    cursor = await db.execute(
        "SELECT latitude, longitude, speed_kmh, baseline_speed_kmh, reason, detail, occurred_at "
        "FROM anomalies WHERE trip_id = ?",
        (trip_id,),
    )
    anomalies = [
        {
            "latitude": a["latitude"],
            "longitude": a["longitude"],
            "speed_kmh": a["speed_kmh"],
            "baseline_speed_kmh": a["baseline_speed_kmh"],
            "reason": a["reason"],
            "detail": a["detail"],
            "occurred_at": str(a["occurred_at"]),
        }
        for a in await cursor.fetchall()
    ]

    # Build trip dict
    trip_data = {
        "mode": trip["mode"],
        "total_distance_km": trip["total_distance_km"],
        "avg_speed_kmh": trip["avg_speed_kmh"],
        "max_speed_kmh": trip["max_speed_kmh"],
        "duration_seconds": trip["duration_seconds"],
        "started_at": str(trip["started_at"]),
        "ended_at": str(trip["ended_at"]),
    }

    # Build prompt
    prompt = _build_coaching_prompt(trip_data, points, anomalies)

    # If API key is not configured, return rule-based analytics
    if not api_key:
        return {
            "trip_id": trip_id,
            "coaching": _generate_fallback_coaching(trip_data, points, anomalies),
            "model": "offline-analyst",
            "warning": "Generated using built-in analytics engine (Gemini API key is not configured).",
        }

    # Call Gemini API
    try:
        from google import genai

        client = genai.Client(api_key=api_key)

        response = client.models.generate_content(
            model="gemini-2.0-flash",
            contents=prompt,
            config={
                "temperature": 0.7,
                "max_output_tokens": 800,
            },
        )

        # Parse the JSON response
        raw_text = response.text.strip()

        # Strip any markdown code fences if the model wraps them anyway
        if raw_text.startswith("```"):
            # Remove first line (```json or ```) and last line (```)
            lines = raw_text.split("\n")
            raw_text = "\n".join(lines[1:-1]).strip()

        coaching = json.loads(raw_text)

        # Validate expected keys
        expected_keys = ["performance", "pace", "slowdowns", "tips", "goal"]
        for key in expected_keys:
            if key not in coaching:
                coaching[key] = "Analysis not available for this section."

        return {
            "trip_id": trip_id,
            "coaching": coaching,
            "model": "gemini-2.0-flash",
        }

    except json.JSONDecodeError:
        # If the model didn't return valid JSON, wrap the raw text
        return {
            "trip_id": trip_id,
            "coaching": {
                "performance": raw_text[:500] if raw_text else "Analysis could not be generated.",
                "pace": "",
                "slowdowns": "",
                "tips": "",
                "goal": "",
            },
            "model": "gemini-2.0-flash",
            "warning": "Response was not structured. Showing raw analysis.",
        }
    except Exception as e:
        error_msg = str(e)
        print(f"[AI Coaching] Gemini API error: {error_msg}. Falling back to offline engine.")
        return {
            "trip_id": trip_id,
            "coaching": _generate_fallback_coaching(trip_data, points, anomalies),
            "model": "offline-analyst",
            "warning": f"Generated using built-in analytics engine (Gemini API: {error_msg[:120]}).",
        }


# ── AI Analysis for Unsaved Trips ────────────────────

@router.post("/analyze")
async def analyze_raw_trip(
    data: TripAnalyzeRequest,
    authorization: str = Header(""),
    db: aiosqlite.Connection = Depends(get_db),
):
    """
    Analyze raw trip data (before saving) using the analysis engine + Gemini.
    Accepts GPS points directly — no trip_id needed.
    """
    from analysis import analyze_trip

    user_id = extract_token(authorization)
    _check_rate_limit(user_id)

    api_key = os.getenv("GEMINI_API_KEY")

    # Convert GPS points to dicts
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

    if len(points_dicts) < 2:
        raise HTTPException(status_code=400, detail="At least 2 GPS points are required for analysis.")

    # Run the analysis engine (speeds, stats, anomalies)
    analysis = await analyze_trip(points_dicts)
    stats = analysis["stats"]
    anomalies = analysis.get("anomalies", [])

    # Build trip dict for the prompt and fallback
    trip_data = {
        "mode": data.mode,
        "total_distance_km": stats["total_distance_km"],
        "avg_speed_kmh": stats["avg_speed_kmh"],
        "max_speed_kmh": stats["max_speed_kmh"],
        "duration_seconds": stats["duration_seconds"],
        "started_at": data.started_at,
        "ended_at": data.ended_at,
    }

    # If API key is missing, return offline rule-based coaching immediately
    if not api_key:
        return {
            "coaching": _generate_fallback_coaching(trip_data, points_dicts, anomalies),
            "stats": stats,
            "anomalies": anomalies,
            "model": "offline-analyst",
            "warning": "Generated using built-in analytics engine (Gemini API key is not configured).",
        }

    # Build and call Gemini
    prompt = _build_coaching_prompt(trip_data, points_dicts, anomalies)

    # Add step count context to prompt if available
    if data.step_count and data.step_count > 0 and data.mode in ("walk", "run"):
        step_context = f"\n\nADDITIONAL DATA:\n- Estimated Step Count: {data.step_count} steps"
        prompt = prompt.replace("RESPONSE FORMAT", f"{step_context}\n\nRESPONSE FORMAT")

    try:
        from google import genai

        client = genai.Client(api_key=api_key)

        response = client.models.generate_content(
            model="gemini-2.0-flash",
            contents=prompt,
            config={
                "temperature": 0.7,
                "max_output_tokens": 800,
            },
        )

        raw_text = response.text.strip()
        if raw_text.startswith("```"):
            lines = raw_text.split("\n")
            raw_text = "\n".join(lines[1:-1]).strip()

        coaching = json.loads(raw_text)

        expected_keys = ["performance", "pace", "slowdowns", "tips", "goal"]
        for key in expected_keys:
            if key not in coaching:
                coaching[key] = "Analysis not available for this section."

        return {
            "coaching": coaching,
            "stats": stats,
            "anomalies": anomalies,
            "model": "gemini-2.0-flash",
        }

    except json.JSONDecodeError:
        return {
            "coaching": {
                "performance": raw_text[:500] if raw_text else "Analysis could not be generated.",
                "pace": "",
                "slowdowns": "",
                "tips": "",
                "goal": "",
            },
            "stats": stats,
            "anomalies": anomalies,
            "model": "gemini-2.0-flash",
            "warning": "Response was not structured. Showing raw analysis.",
        }
    except Exception as e:
        error_msg = str(e)
        print(f"[AI Raw Analysis] Gemini API error: {error_msg}. Falling back to offline engine.")
        return {
            "coaching": _generate_fallback_coaching(trip_data, points_dicts, anomalies),
            "stats": stats,
            "anomalies": anomalies,
            "model": "offline-analyst",
            "warning": f"Generated using built-in analytics engine (Gemini API: {error_msg[:120]}).",
        }
