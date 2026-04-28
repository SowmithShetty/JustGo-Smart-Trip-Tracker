"""
Users router — Update user settings (units, theme).
"""

from fastapi import APIRouter, Depends, HTTPException, Header
import asyncpg

from database import get_db
from models import UserSettings, UserResponse
from routers.auth import extract_token

router = APIRouter(prefix="/api/users", tags=["users"])


@router.put("/settings", response_model=UserResponse)
async def update_settings(
    data: UserSettings,
    authorization: str = Header(""),
    db: asyncpg.Connection = Depends(get_db)
):
    """Update user preferences (units, theme)."""
    user_id = extract_token(authorization)

    updates = []
    params = []
    param_idx = 1

    if data.units and data.units in ("km", "mi"):
        updates.append(f"units = ${param_idx}")
        params.append(data.units)
        param_idx += 1

    if data.theme and data.theme in ("light", "dark"):
        updates.append(f"theme = ${param_idx}")
        params.append(data.theme)
        param_idx += 1

    if not updates:
        raise HTTPException(status_code=400, detail="No valid settings to update")

    params.append(user_id)
    query = f"UPDATE users SET {', '.join(updates)} WHERE id = ${param_idx}"
    await db.execute(query, *params)

    user = await db.fetchrow("SELECT * FROM users WHERE id = $1", user_id)

    return UserResponse(
        id=user["id"],
        username=user["username"],
        email=user["email"],
        units=user["units"],
        theme=user["theme"],
        created_at=str(user["created_at"]),
    )
