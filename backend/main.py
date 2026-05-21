"""
JustGo Backend — FastAPI application entry point.
"""

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from database import init_pool, close_pool, init_db
from routers import auth, trips, users


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize database pool on startup, close on shutdown."""
    await init_pool()
    await init_db()
    print("[OK] Database initialized")
    yield
    await close_pool()


app = FastAPI(
    title="JustGo API",
    description="GPS Trip Tracking & Analysis Engine",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS — allow frontend to connect
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, lock this down
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount routers
app.include_router(auth.router)
app.include_router(trips.router)
app.include_router(users.router)


@app.get("/")
async def root():
    return {
        "app": "JustGo API",
        "version": "1.0.0",
        "docs": "/docs",
    }


@app.get("/api/wake")
async def wake():
    """Ultra-lightweight endpoint for pre-warming the Render server.
    Frontend calls this before auth to wake the server from sleep."""
    from database import pool
    return {
        "status": "awake",
        "db": "ready" if pool is not None else "connecting",
    }


@app.get("/api/health")
async def health():
    import time
    from database import pool
    db_status = "disconnected"
    db_latency_ms = None
    if pool is not None:
        try:
            t0 = time.monotonic()
            async with pool.acquire() as conn:
                await conn.fetchval("SELECT 1")
            db_latency_ms = round((time.monotonic() - t0) * 1000, 1)
            db_status = "connected"
        except Exception:
            db_status = "error"
    return {
        "status": "healthy",
        "database": db_status,
        "db_latency_ms": db_latency_ms,
    }


@app.post("/api/reconnect")
async def reconnect():
    """Attempt to reconnect to the database (useful after Supabase wakes up)."""
    from database import pool, init_pool, init_db
    if pool is not None:
        return {"status": "already_connected"}
    await init_pool()
    await init_db()
    from database import pool as new_pool
    if new_pool is not None:
        return {"status": "reconnected"}
    return {"status": "failed", "detail": "Could not connect to database"}
