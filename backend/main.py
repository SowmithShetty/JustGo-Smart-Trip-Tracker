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


@app.get("/api/health")
async def health():
    return {"status": "healthy"}
