"""
Authentication router — Register, Login, and Get Current User.
Uses JWT tokens for session management.
"""

"""
Authentication router — Register, Login, and Get Current User.
Uses JWT tokens for session management.
"""

import re
import jwt
import os
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, Header, status
from passlib.context import CryptContext
import asyncpg
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests

from database import get_db
from models import UserCreate, UserLogin, GoogleLogin, UserResponse, TokenResponse

router = APIRouter(prefix="/api/auth", tags=["auth"])

# ── Config ───────────────────────────────────────────────

SECRET_KEY = os.getenv("JWT_SECRET", "justgo-super-secret-key-change-in-prod")
ALGORITHM = "HS256"
TOKEN_EXPIRE_HOURS = 72
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "YOUR_GOOGLE_CLIENT_ID")

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


async def get_current_user(db: asyncpg.Connection = Depends(get_db)):
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
async def register(data: UserCreate, db: asyncpg.Connection = Depends(get_db)):
    """Create a new user account."""
    # Validate username format (alphanumeric + underscores)
    if not re.match(r'^[a-zA-Z0-9_]+$', data.username):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Username may only contain letters, numbers, and underscores"
        )

    # Validate password strength (8+ chars, letter, number, special char)
    if len(data.password) < 8:
        raise HTTPException(status_code=422, detail="Password must be at least 8 characters")
    if not re.search(r'[A-Za-z]', data.password):
        raise HTTPException(status_code=422, detail="Password must contain at least one letter")
    if not re.search(r'[0-9]', data.password):
        raise HTTPException(status_code=422, detail="Password must contain at least one number")
    if not re.search(r'[!@#$%^&*()_+\-=\[\]{};\':"\\|,.<>\/?]', data.password):
        raise HTTPException(status_code=422, detail="Password must contain at least one special character")

    # Check if email or username already exists
    existing = await db.fetchrow(
        "SELECT id FROM users WHERE email = $1 OR username = $2",
        data.email, data.username
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email or username already registered"
        )

    hashed = hash_password(data.password)
    user = await db.fetchrow(
        "INSERT INTO users (username, email, password_hash) VALUES ($1, $2, $3) RETURNING *",
        data.username, data.email, hashed
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


@router.post("/login", response_model=TokenResponse)
async def login(data: UserLogin, db: asyncpg.Connection = Depends(get_db)):
    """Login with email and password."""
    user = await db.fetchrow(
        "SELECT * FROM users WHERE email = $1", data.email
    )

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
    authorization: str = Header(""),
    db: asyncpg.Connection = Depends(get_db)
):
    """Get current user from JWT token."""
    user_id = extract_token(authorization)

    user = await db.fetchrow("SELECT * FROM users WHERE id = $1", user_id)

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

@router.post("/google", response_model=TokenResponse)
async def google_login(login_data: GoogleLogin, db: asyncpg.Connection = Depends(get_db)):
    """Authenticate or register user via Google ID Token."""
    try:
        # 1. Verify Google token
        idinfo = id_token.verify_oauth2_token(
            login_data.credential, 
            google_requests.Request(), 
            GOOGLE_CLIENT_ID
        )
        
        email = idinfo.get("email")
        if not email:
            raise HTTPException(status_code=400, detail="Google token missing email")
            
        username = idinfo.get("email").split('@')[0] # Basic username from email
        
        # Strip invalid characters for username
        username = re.sub(r'[^a-zA-Z0-9_]', '', username)[:30]
        if len(username) < 3:
            username = username + "123"

        # 2. Check if user exists
        user = await db.fetchrow("SELECT * FROM users WHERE email = $1", email)
        
        if not user:
            # 3. Create new user if they don't exist
            # Try to ensure username is unique
            base_username = username
            counter = 1
            while await db.fetchrow("SELECT id FROM users WHERE username = $1", username):
                username = f"{base_username[:27]}{counter}"
                counter += 1
                
            row = await db.fetchrow(
                """
                INSERT INTO users (username, email, password_hash, auth_provider)
                VALUES ($1, $2, NULL, 'google')
                RETURNING id, username, email, units, theme, created_at
                """,
                username, email
            )
            user = row
            
        # 4. Generate our own JWT token
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
        
    except ValueError as e:
        # Invalid token
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid Google token: {str(e)}",
        )
