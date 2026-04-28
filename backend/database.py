"""
Database module — PostgreSQL (Supabase) setup via asyncpg connection pool.
"""

import asyncpg
import os

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://postgres:Sowmith%402005@db.udbxbqsnhxxotftwhxnz.supabase.co:5432/postgres"
)

# Global connection pool — initialized in app lifespan
pool: asyncpg.Pool = None


async def init_pool():
    """Create the asyncpg connection pool."""
    global pool
    pool = await asyncpg.create_pool(
        DATABASE_URL,
        min_size=2,
        max_size=10,
        statement_cache_size=0,  # Required for Supabase's PgBouncer in transaction mode
    )
    print("[OK] PostgreSQL connection pool created")


async def close_pool():
    """Close the connection pool gracefully."""
    global pool
    if pool:
        await pool.close()
        pool = None
        print("[OK] PostgreSQL connection pool closed")


async def get_db():
    """Yield an asyncpg connection from the pool."""
    async with pool.acquire() as conn:
        yield conn


async def init_db():
    """Create all tables if they don't exist."""
    async with pool.acquire() as conn:
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                username TEXT UNIQUE NOT NULL,
                email TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                units TEXT DEFAULT 'km',
                theme TEXT DEFAULT 'dark',
                created_at TIMESTAMPTZ DEFAULT NOW()
            );
        """)

        await conn.execute("""
            CREATE TABLE IF NOT EXISTS trips (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                mode TEXT DEFAULT 'walk',
                total_distance_km DOUBLE PRECISION DEFAULT 0,
                avg_speed_kmh DOUBLE PRECISION DEFAULT 0,
                max_speed_kmh DOUBLE PRECISION DEFAULT 0,
                duration_seconds INTEGER DEFAULT 0,
                started_at TIMESTAMPTZ,
                ended_at TIMESTAMPTZ,
                insights_json JSONB DEFAULT '{}',
                created_at TIMESTAMPTZ DEFAULT NOW()
            );
        """)

        await conn.execute("""
            CREATE TABLE IF NOT EXISTS gps_points (
                id SERIAL PRIMARY KEY,
                trip_id INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
                latitude DOUBLE PRECISION NOT NULL,
                longitude DOUBLE PRECISION NOT NULL,
                altitude DOUBLE PRECISION DEFAULT 0,
                speed_kmh DOUBLE PRECISION DEFAULT 0,
                recorded_at TIMESTAMPTZ NOT NULL,
                sequence_order INTEGER NOT NULL
            );
        """)

        await conn.execute("""
            CREATE TABLE IF NOT EXISTS anomalies (
                id SERIAL PRIMARY KEY,
                trip_id INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
                latitude DOUBLE PRECISION NOT NULL,
                longitude DOUBLE PRECISION NOT NULL,
                speed_kmh DOUBLE PRECISION DEFAULT 0,
                baseline_speed_kmh DOUBLE PRECISION DEFAULT 0,
                reason TEXT DEFAULT 'unknown',
                detail TEXT DEFAULT '',
                occurred_at TIMESTAMPTZ
            );
        """)

        await conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_trips_user ON trips(user_id);
        """)
        await conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_gps_trip ON gps_points(trip_id);
        """)
        await conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_anomalies_trip ON anomalies(trip_id);
        """)

    print("[OK] Database tables verified")
