"""
JustGo Backend — FastAPI application entry point.
"""

from dotenv import load_dotenv
load_dotenv()

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from database import init_pool, close_pool, init_db

from routers import auth, trips, users, ai


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize database on startup, close on shutdown."""
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
app.include_router(ai.router)


@app.get("/")
async def root():
    return {
        "app": "JustGo API",
        "version": "1.0.0",
        "docs": "/docs",
    }


@app.get("/api/wake")
async def wake():
    """Ultra-lightweight endpoint for pre-warming the server."""
    from database import db
    return {
        "status": "awake",
        "db": "ready" if db is not None else "connecting",
    }


@app.get("/api/health")
async def health():
    from database import db
    db_status = "disconnected"
    if db is not None:
        try:
            cursor = await db.execute("SELECT 1")
            await cursor.fetchone()
            db_status = "connected"
        except Exception:
            db_status = "error"
    return {
        "status": "healthy",
        "database": db_status,
    }


@app.post("/api/reconnect")
async def reconnect():
    """Attempt to reconnect to the database."""
    from database import db, init_pool, init_db
    if db is not None:
        return {"status": "already_connected"}
    await init_pool()
    await init_db()
    from database import db as new_db
    if new_db is not None:
        return {"status": "reconnected"}
    return {"status": "failed", "detail": "Could not connect to database"}
