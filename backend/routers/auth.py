"""
Authentication router — Register, Login, and Get Current User.
Uses JWT tokens for session management.
"""

import re
import jwt
import os
import bcrypt
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, Header, status
import aiosqlite

from database import get_db
from models import UserCreate, UserLogin, GoogleLogin, UserResponse, TokenResponse

router = APIRouter(prefix="/api/auth", tags=["auth"])

# ── Config ───────────────────────────────────────────────

SECRET_KEY = os.getenv("JWT_SECRET", "justgo-super-secret-key-change-in-prod")
ALGORITHM = "HS256"
TOKEN_EXPIRE_HOURS = 72
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "5347821434-t6jr98m948lf5p81mas61fqab2m2jebr.apps.googleusercontent.com")


# ── Helpers ──────────────────────────────────────────────

def hash_password(password: str) -> str:
    """Hash a password using bcrypt directly."""
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    """Verify a password against a bcrypt hash."""
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


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


def _row_to_dict(row):
    """Convert an aiosqlite Row to a dict."""
    if row is None:
        return None
    return dict(row)


# ── Routes ───────────────────────────────────────────────

@router.post("/register", response_model=TokenResponse)
async def register(data: UserCreate, db: aiosqlite.Connection = Depends(get_db)):
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

    cursor = await db.execute("SELECT * FROM users WHERE id = ?", (user_id,))
    user = _row_to_dict(await cursor.fetchone())

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
async def login(data: UserLogin, db: aiosqlite.Connection = Depends(get_db)):
    """Login with email and password."""
    cursor = await db.execute(
        "SELECT * FROM users WHERE email = ?", (data.email,)
    )
    user = _row_to_dict(await cursor.fetchone())

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password"
        )

    # Handle Google-auth users trying to use password login
    if not user["password_hash"]:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="This account uses Google Sign-In. Please use the Google button to log in."
        )

    if not verify_password(data.password, user["password_hash"]):
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
    db: aiosqlite.Connection = Depends(get_db)
):
    """Get current user from JWT token."""
    user_id = extract_token(authorization)

    cursor = await db.execute("SELECT * FROM users WHERE id = ?", (user_id,))
    user = _row_to_dict(await cursor.fetchone())

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
async def google_login(login_data: GoogleLogin, db: aiosqlite.Connection = Depends(get_db)):
    """Authenticate or register user via Google ID Token."""
    try:
        # 1. Verify Google token
        from google.oauth2 import id_token
        from google.auth.transport import requests as google_requests

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
        cursor = await db.execute("SELECT * FROM users WHERE email = ?", (email,))
        user = _row_to_dict(await cursor.fetchone())
        
        if not user:
            # 3. Create new user if they don't exist
            # Try to ensure username is unique
            base_username = username
            counter = 1
            cursor = await db.execute("SELECT id FROM users WHERE username = ?", (username,))
            while await cursor.fetchone():
                username = f"{base_username[:27]}{counter}"
                counter += 1
                cursor = await db.execute("SELECT id FROM users WHERE username = ?", (username,))
                
            cursor = await db.execute(
                """
                INSERT INTO users (username, email, password_hash, auth_provider)
                VALUES (?, ?, NULL, 'google')
                """,
                (username, email)
            )
            await db.commit()
            user_id = cursor.lastrowid

            cursor = await db.execute(
                "SELECT id, username, email, units, theme, created_at FROM users WHERE id = ?",
                (user_id,)
            )
            user = _row_to_dict(await cursor.fetchone())
            
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
        # Invalid token or audience mismatch
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Google authentication failed: {str(e)}. Please ensure GOOGLE_CLIENT_ID matches your Google Cloud Console configuration.",
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Google sign-in error: {str(e)}",
        )
