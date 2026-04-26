"""
Users router — Update user settings (units, theme).
"""

from fastapi import APIRouter, Depends, HTTPException, Header
import aiosqlite

from database import get_db
from models import UserSettings, UserResponse
from routers.auth import extract_token

router = APIRouter(prefix="/api/users", tags=["users"])


@router.put("/settings", response_model=UserResponse)
async def update_settings(
    data: UserSettings,
    authorization: str = Header(""),
    db: aiosqlite.Connection = Depends(get_db)
):
    """Update user preferences (units, theme)."""
    user_id = extract_token(authorization)

    updates = []
    params = []

    if data.units and data.units in ("km", "mi"):
        updates.append("units = ?")
        params.append(data.units)

    if data.theme and data.theme in ("light", "dark"):
        updates.append("theme = ?")
        params.append(data.theme)

    if not updates:
        raise HTTPException(status_code=400, detail="No valid settings to update")

    params.append(user_id)
    query = f"UPDATE users SET {', '.join(updates)} WHERE id = ?"
    await db.execute(query, params)
    await db.commit()

    cursor = await db.execute("SELECT * FROM users WHERE id = ?", (user_id,))
    user = await cursor.fetchone()

    return UserResponse(
        id=user["id"],
        username=user["username"],
        email=user["email"],
        units=user["units"],
        theme=user["theme"],
        created_at=str(user["created_at"]),
    )
