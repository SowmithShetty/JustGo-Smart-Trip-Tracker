"""
Database module — SQLite setup, schema creation, and helper functions.
"""

import aiosqlite
import os

DB_PATH = os.path.join(os.path.dirname(__file__), "justgo.db")


async def get_db():
    """Yield an async SQLite connection."""
    db = await aiosqlite.connect(DB_PATH)
    db.row_factory = aiosqlite.Row
    try:
        yield db
    finally:
        await db.close()


async def init_db():
    """Create all tables if they don't exist."""
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("PRAGMA journal_mode=WAL;")
        await db.execute("PRAGMA foreign_keys=ON;")

        await db.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                email TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                units TEXT DEFAULT 'km',
                theme TEXT DEFAULT 'dark',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
        """)

        await db.execute("""
            CREATE TABLE IF NOT EXISTS trips (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                mode TEXT DEFAULT 'walk',
                total_distance_km REAL DEFAULT 0,
                avg_speed_kmh REAL DEFAULT 0,
                max_speed_kmh REAL DEFAULT 0,
                duration_seconds INTEGER DEFAULT 0,
                started_at DATETIME,
                ended_at DATETIME,
                insights_json TEXT DEFAULT '{}',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );
        """)

        await db.execute("""
            CREATE TABLE IF NOT EXISTS gps_points (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                trip_id INTEGER NOT NULL,
                latitude REAL NOT NULL,
                longitude REAL NOT NULL,
                altitude REAL DEFAULT 0,
                speed_kmh REAL DEFAULT 0,
                recorded_at DATETIME NOT NULL,
                sequence_order INTEGER NOT NULL,
                FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE
            );
        """)

        await db.execute("""
            CREATE TABLE IF NOT EXISTS anomalies (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                trip_id INTEGER NOT NULL,
                latitude REAL NOT NULL,
                longitude REAL NOT NULL,
                speed_kmh REAL DEFAULT 0,
                baseline_speed_kmh REAL DEFAULT 0,
                reason TEXT DEFAULT 'unknown',
                detail TEXT DEFAULT '',
                occurred_at DATETIME,
                FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE
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
