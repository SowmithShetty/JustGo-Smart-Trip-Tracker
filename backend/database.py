"""
Database module — PostgreSQL (Supabase) setup via asyncpg connection pool.
Includes retry logic for free-tier Supabase projects that may be paused/waking.
"""

import asyncio
import asyncpg
import os

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://postgres:Sowmith%402005@db.udbxbqsnhxxotftwhxnz.supabase.co:5432/postgres"
)

# Global connection pool — initialized in app lifespan
pool: asyncpg.Pool = None

# Maximum retries for initial connection (Supabase free tier can take up to 60s to wake)
MAX_CONNECT_RETRIES = 5
RETRY_DELAY_SECONDS = 5


async def init_pool():
    """Create the asyncpg connection pool with retry logic for paused Supabase projects."""
    global pool
    last_error = None

    for attempt in range(1, MAX_CONNECT_RETRIES + 1):
        try:
            pool = await asyncpg.create_pool(
                DATABASE_URL,
                min_size=1,
                max_size=10,
                statement_cache_size=0,  # Required for Supabase's PgBouncer in transaction mode
                command_timeout=30,
                timeout=15,             # Connection timeout per attempt
            )
            print(f"[OK] PostgreSQL connection pool created (attempt {attempt})")
            return
        except Exception as e:
            last_error = e
            print(f"[WARN] DB connection attempt {attempt}/{MAX_CONNECT_RETRIES} failed: {e}")
            if attempt < MAX_CONNECT_RETRIES:
                print(f"[WARN] Retrying in {RETRY_DELAY_SECONDS}s...")
                await asyncio.sleep(RETRY_DELAY_SECONDS)

    # All retries exhausted — log the error but don't crash the app
    print(f"[ERROR] Could not connect to database after {MAX_CONNECT_RETRIES} attempts: {last_error}")
    print("[WARN] Server will start without database. Auth endpoints will return 503.")


async def close_pool():
    """Close the connection pool gracefully."""
    global pool
    if pool:
        await pool.close()
        pool = None
        print("[OK] PostgreSQL connection pool closed")


async def get_db():
    """Yield an asyncpg connection from the pool."""
    if pool is None:
        from fastapi import HTTPException
        raise HTTPException(
            status_code=503,
            detail="Database is temporarily unavailable. The server is starting up — please try again in a moment."
        )
    async with pool.acquire() as conn:
        yield conn


async def init_db():
    """Create all tables if they don't exist."""
    if pool is None:
        print("[SKIP] Skipping table creation — no database connection")
        return

    async with pool.acquire() as conn:
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                username TEXT UNIQUE NOT NULL,
                email TEXT UNIQUE NOT NULL,
                password_hash TEXT,
                auth_provider TEXT DEFAULT 'local',
                units TEXT DEFAULT 'km',
                theme TEXT DEFAULT 'dark',
                created_at TIMESTAMPTZ DEFAULT NOW()
            );
        """)

        # Migration: Add auth_provider and drop NOT NULL from password_hash for existing tables
        await conn.execute("""
            ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_provider TEXT DEFAULT 'local';
            ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
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
