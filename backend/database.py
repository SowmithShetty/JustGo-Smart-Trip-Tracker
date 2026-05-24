"""
Database module — PostgreSQL (Supabase) setup via asyncpg connection pool.
Includes retry logic for free-tier Supabase projects that may be paused/waking.
"""

import asyncio
import asyncpg
import os

# Use Supabase Session Pooler (port 5432) which is IPv4 compatible
# (Direct connection is IPv6-only and not supported on Render free tier).
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://postgres.udbxbqsnhxxotftwhxnz:Sowmith%402005@aws-1-ap-south-1.pooler.supabase.com:5432/postgres"
)

# Global connection pool — initialized in app lifespan
pool: asyncpg.Pool = None

# Maximum retries for initial connection (Supabase free tier can take up to 60s to wake)
MAX_CONNECT_RETRIES = 5
RETRY_DELAY_SECONDS = 5

# Background task reference
_bg_connect_task = None


async def _try_connect(connect_timeout=15):
    """Attempt to create a connection pool. Returns True on success."""
    global pool
    try:
        pool = await asyncpg.create_pool(
            DATABASE_URL,
            min_size=1,
            max_size=10,
            statement_cache_size=0,  # Required for Supabase's PgBouncer in transaction mode
            command_timeout=30,
            timeout=connect_timeout,
        )
        # Quick health check — verify the connection actually works
        async with pool.acquire() as conn:
            await conn.fetchval("SELECT 1")
        return True
    except Exception as e:
        print(f"[WARN] Connection attempt failed: {e}")
        if pool:
            try:
                await pool.close()
            except Exception:
                pass
        pool = None
        return False


async def _background_connect():
    """Try to connect in the background with retries."""
    global pool
    for attempt in range(1, MAX_CONNECT_RETRIES + 1):
        if pool is not None:
            return  # Already connected
        try:
            success = await _try_connect()
            if success:
                print(f"[OK] PostgreSQL connection pool created (attempt {attempt})")
                await _init_tables()
                return
        except Exception as e:
            pass
        print(f"[WARN] DB connection attempt {attempt}/{MAX_CONNECT_RETRIES} failed")
        if attempt < MAX_CONNECT_RETRIES:
            await asyncio.sleep(RETRY_DELAY_SECONDS)

    print(f"[ERROR] Could not connect to database after {MAX_CONNECT_RETRIES} attempts")
    print("[WARN] Server running without database. Auth endpoints will return 503.")
    print("[WARN] Go to Supabase Dashboard to unpause the project, then call POST /api/reconnect")


async def init_pool():
    """
    Create the asyncpg connection pool.
    Makes one quick attempt, then if it fails, starts background retries
    so the server can start immediately.
    """
    global pool, _bg_connect_task

    # Quick first attempt with short timeout
    success = await _try_connect(connect_timeout=8)
    if success:
        print("[OK] PostgreSQL connection pool created")
        return

    print("[WARN] Quick DB connection failed")
    print("[INFO] Starting background connection retries...")

    # Start background retries so server can begin accepting requests immediately
    _bg_connect_task = asyncio.create_task(_background_connect())


async def close_pool():
    """Close the connection pool gracefully."""
    global pool, _bg_connect_task
    if _bg_connect_task and not _bg_connect_task.done():
        _bg_connect_task.cancel()
        _bg_connect_task = None
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


async def _init_tables():
    """Create all tables if they don't exist (internal helper)."""
    if pool is None:
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


async def init_db():
    """Create all tables if they don't exist."""
    if pool is None:
        print("[SKIP] Skipping table creation — no database connection yet")
        return
    await _init_tables()
