"""
Admin authentication - simple password-based auth with JWT cookies
"""

from datetime import datetime, timedelta
from typing import Optional

import jwt
from fastapi import HTTPException, Request
from fastapi.responses import RedirectResponse

from app.config import SETTINGS

TOKEN_COOKIE_NAME = "ipqs_admin_token"
TOKEN_EXPIRE_HOURS = 24


def create_token() -> str:
    """Create JWT token for admin session"""
    payload = {
        "exp": datetime.utcnow() + timedelta(hours=TOKEN_EXPIRE_HOURS),
        "iat": datetime.utcnow(),
        "role": "admin",
    }
    return jwt.encode(payload, SETTINGS.admin_token_secret, algorithm="HS256")


def verify_token(token: str) -> bool:
    """Verify JWT token"""
    try:
        jwt.decode(token, SETTINGS.admin_token_secret, algorithms=["HS256"])
        return True
    except jwt.ExpiredSignatureError:
        return False
    except jwt.InvalidTokenError:
        return False


def get_current_admin(request: Request) -> bool:
    """Check if request has valid admin token"""
    token = request.cookies.get(TOKEN_COOKIE_NAME)
    if not token:
        return False
    return verify_token(token)


async def require_admin(request: Request) -> bool:
    """Dependency to protect admin routes"""
    if not get_current_admin(request):
        # For API endpoints return 401
        if request.url.path.startswith("/admin/api/"):
            raise HTTPException(status_code=401, detail="Unauthorized")
        # For pages redirect to login
        raise HTTPException(
            status_code=302,
            headers={"Location": "/admin/login"}
        )
    return True
