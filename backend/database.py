"""
Database module — Local SQLite setup via aiosqlite.
All data is stored in a local justgo.db file — no external services required.
"""

import os
import aiosqlite

# Path to the SQLite database file (next to this script)
DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "justgo.db")

# Global connection — initialized in app lifespan
db: aiosqlite.Connection = None


async def init_pool():
    """Open the SQLite connection and enable WAL mode for concurrency."""
    global db
    db = await aiosqlite.connect(DB_PATH)
    db.row_factory = aiosqlite.Row  # Enable dict-like access on rows
    await db.execute("PRAGMA journal_mode=WAL")
    await db.execute("PRAGMA foreign_keys=ON")
    await db.commit()
    print(f"[OK] SQLite database opened: {DB_PATH}")


async def close_pool():
    """Close the SQLite connection gracefully."""
    global db
    if db:
        await db.close()
        db = None
        print("[OK] SQLite database closed")


async def get_db():
    """Yield the shared SQLite connection (FastAPI dependency)."""
    if db is None:
        from fastapi import HTTPException
        raise HTTPException(
            status_code=503,
            detail="Database is temporarily unavailable. The server is starting up — please try again in a moment."
        )
    yield db


async def _init_tables():
    """Create all tables if they don't exist."""
    if db is None:
        return

    await db.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT,
            auth_provider TEXT DEFAULT 'local',
            units TEXT DEFAULT 'km',
            theme TEXT DEFAULT 'dark',
            created_at TEXT DEFAULT (datetime('now'))
        );
    """)

    await db.execute("""
        CREATE TABLE IF NOT EXISTS trips (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            mode TEXT DEFAULT 'walk',
            total_distance_km REAL DEFAULT 0,
            avg_speed_kmh REAL DEFAULT 0,
            max_speed_kmh REAL DEFAULT 0,
            duration_seconds INTEGER DEFAULT 0,
            started_at TEXT,
            ended_at TEXT,
            insights_json TEXT DEFAULT '{}',
            created_at TEXT DEFAULT (datetime('now'))
        );
    """)

    await db.execute("""
        CREATE TABLE IF NOT EXISTS gps_points (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            trip_id INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
            latitude REAL NOT NULL,
            longitude REAL NOT NULL,
            altitude REAL DEFAULT 0,
            speed_kmh REAL DEFAULT 0,
            recorded_at TEXT NOT NULL,
            sequence_order INTEGER NOT NULL
        );
    """)

    await db.execute("""
        CREATE TABLE IF NOT EXISTS anomalies (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            trip_id INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
            latitude REAL NOT NULL,
            longitude REAL NOT NULL,
            speed_kmh REAL DEFAULT 0,
            baseline_speed_kmh REAL DEFAULT 0,
            reason TEXT DEFAULT 'unknown',
            detail TEXT DEFAULT '',
            occurred_at TEXT
        );
    """)

    await db.execute("""
        CREATE INDEX IF NOT EXISTS idx_trips_user ON trips(user_id);
    """)
    await db.execute("""
        CREATE INDEX IF NOT EXISTS idx_gps_trip ON gps_points(trip_id);
    """)
    await db.execute("""
        CREATE INDEX IF NOT EXISTS idx_anomalies_trip ON anomalies(trip_id);
    """)

    await db.commit()
    print("[OK] Database tables verified")


async def init_db():
    """Create all tables if they don't exist."""
    if db is None:
        print("[SKIP] Skipping table creation — no database connection yet")
        return
    await _init_tables()
