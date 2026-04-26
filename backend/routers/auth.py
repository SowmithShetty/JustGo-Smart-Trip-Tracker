"""
Authentication router — Register, Login, and Get Current User.
Uses JWT tokens for session management.
"""

import jwt
import os
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from passlib.context import CryptContext
import aiosqlite

from database import get_db
from models import UserCreate, UserLogin, UserResponse, TokenResponse

router = APIRouter(prefix="/api/auth", tags=["auth"])

# ── Config ───────────────────────────────────────────────

SECRET_KEY = os.getenv("JWT_SECRET", "justgo-super-secret-key-change-in-prod")
ALGORITHM = "HS256"
TOKEN_EXPIRE_HOURS = 72

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


# ── Helpers ──────────────────────────────────────────────

def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def create_token(user_id: int) -> str:
    payload = {
        "sub": str(user_id),
        "exp": datetime.now(timezone.utc) + timedelta(hours=TOKEN_EXPIRE_HOURS),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


async def get_current_user(db: aiosqlite.Connection = Depends(get_db)):
    """
    This is a dependency placeholder. The actual token extraction
    happens in each endpoint via the Authorization header.
    """
    return db


def decode_token(token: str) -> int:
    """Decode JWT and return user_id."""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = int(payload.get("sub", 0))
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token")
        return user_id
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


def extract_token(authorization: str) -> int:
    """Extract and decode token from Authorization header."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing authorization")
    token = authorization.split(" ", 1)[1]
    return decode_token(token)


# ── Routes ───────────────────────────────────────────────

@router.post("/register", response_model=TokenResponse)
async def register(data: UserCreate, db: aiosqlite.Connection = Depends(get_db)):
    """Create a new user account."""
    # Check if email or username already exists
    cursor = await db.execute(
        "SELECT id FROM users WHERE email = ? OR username = ?",
        (data.email, data.username)
    )
    existing = await cursor.fetchone()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email or username already registered"
        )

    hashed = hash_password(data.password)
    cursor = await db.execute(
        "INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)",
        (data.username, data.email, hashed)
    )
    await db.commit()
    user_id = cursor.lastrowid

    # Fetch the created user
    cursor = await db.execute("SELECT * FROM users WHERE id = ?", (user_id,))
    user = await cursor.fetchone()

    token = create_token(user_id)

    return TokenResponse(
        access_token=token,
        user=UserResponse(
            id=user["id"],
            username=user["username"],
            email=user["email"],
            units=user["units"],
            theme=user["theme"],
            created_at=str(user["created_at"]),
        )
    )


@router.post("/login", response_model=TokenResponse)
async def login(data: UserLogin, db: aiosqlite.Connection = Depends(get_db)):
    """Login with email and password."""
    cursor = await db.execute(
        "SELECT * FROM users WHERE email = ?", (data.email,)
    )
    user = await cursor.fetchone()

    if not user or not verify_password(data.password, user["password_hash"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password"
        )

    token = create_token(user["id"])

    return TokenResponse(
        access_token=token,
        user=UserResponse(
            id=user["id"],
            username=user["username"],
            email=user["email"],
            units=user["units"],
            theme=user["theme"],
            created_at=str(user["created_at"]),
        )
    )


@router.get("/me", response_model=UserResponse)
async def get_me(
    authorization: str = "",
    db: aiosqlite.Connection = Depends(get_db)
):
    """Get current user from JWT token."""
    from fastapi import Header
    # This will be called with the header
    user_id = extract_token(authorization)

    cursor = await db.execute("SELECT * FROM users WHERE id = ?", (user_id,))
    user = await cursor.fetchone()

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    return UserResponse(
        id=user["id"],
        username=user["username"],
        email=user["email"],
        units=user["units"],
        theme=user["theme"],
        created_at=str(user["created_at"]),
    )
