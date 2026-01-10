"""
Admin routes - dashboard, profiles, history
"""

from pathlib import Path
from datetime import datetime

from fastapi import APIRouter, Depends, Request, Form, Query
from fastapi.responses import HTMLResponse, RedirectResponse, JSONResponse
from fastapi.templating import Jinja2Templates
from sqlmodel.ext.asyncio.session import AsyncSession

from app.db import db, get_db
from app.admin.auth import (
    require_admin,
    create_token,
    TOKEN_COOKIE_NAME,
    get_current_admin,
)
from app.config import SETTINGS
from app.services import profile_service, check_service

router = APIRouter(prefix="/admin", tags=["admin"])

# Templates
TEMPLATES_DIR = Path(__file__).parent / "templates"
templates = Jinja2Templates(directory=str(TEMPLATES_DIR))


# Custom Jinja2 filters
def format_datetime(value, format="%d.%m.%Y %H:%M"):
    """Format datetime for display"""
    if isinstance(value, str):
        try:
            value = datetime.fromisoformat(value)
        except ValueError:
            return value
    if value:
        return value.strftime(format)
    return "N/A"


def format_fraud_score(value):
    """Format fraud score with color class"""
    if value is None:
        return "N/A"
    return f"{value}%"


def fraud_color_class(value):
    """Get CSS class for fraud score"""
    if value is None:
        return "muted"
    if value < 30:
        return "success"
    if value < 70:
        return "warning"
    return "danger"


# Register filters
templates.env.filters["datetime"] = format_datetime
templates.env.filters["fraud_score"] = format_fraud_score
templates.env.globals["fraud_color_class"] = fraud_color_class


# === Auth Routes ===

@router.get("/login", response_class=HTMLResponse)
async def login_page(request: Request):
    """Login page"""
    if get_current_admin(request):
        return RedirectResponse(url="/admin", status_code=302)
    return templates.TemplateResponse("login.html", {"request": request})


@router.post("/login")
async def login(request: Request, password: str = Form(...)):
    """Process login"""
    if password == SETTINGS.admin_password:
        response = RedirectResponse(url="/admin", status_code=302)
        token = create_token()
        response.set_cookie(
            key=TOKEN_COOKIE_NAME,
            value=token,
            httponly=True,
            max_age=86400,  # 24 hours
            samesite="lax",
        )
        return response
    return templates.TemplateResponse(
        "login.html",
        {"request": request, "error": "Неверный пароль"}
    )


@router.get("/logout")
async def logout():
    """Logout"""
    response = RedirectResponse(url="/admin/login", status_code=302)
    response.delete_cookie(TOKEN_COOKIE_NAME)
    return response


# === Dashboard ===

@router.get("", response_class=HTMLResponse)
async def dashboard(request: Request, _: bool = Depends(require_admin)):
    """Dashboard with statistics"""
    try:
        async with db.session() as session:
            stats = await check_service.get_stats(session)
            recent_checks = await check_service.get_recent_checks(session, limit=10)

            # Load profiles for recent checks
            for check in recent_checks:
                if check.profile_id:
                    check.profile = await profile_service.get_profile_by_id(
                        session, check.profile_id
                    )

        return templates.TemplateResponse("dashboard.html", {
            "request": request,
            "stats": stats,
            "recent_checks": recent_checks,
            "page_title": "Dashboard",
        })
    except Exception as e:
        return templates.TemplateResponse("dashboard.html", {
            "request": request,
            "stats": {},
            "recent_checks": [],
            "error": str(e),
            "page_title": "Dashboard",
        })


# === Profiles ===

@router.get("/profiles", response_class=HTMLResponse)
async def profiles_list(
    request: Request,
    page: int = Query(1, ge=1),
    search: str = Query(None),
    order_by: str = Query("last_seen"),
    flagged: bool = Query(False),
    _: bool = Depends(require_admin),
):
    """Profiles list with pagination"""
    limit = 20
    offset = (page - 1) * limit

    try:
        async with db.session() as session:
            profiles, total = await profile_service.get_profiles(
                session,
                limit=limit,
                offset=offset,
                order_by=order_by,
                search=search,
                flagged_only=flagged,
            )

        pages = (total + limit - 1) // limit

        return templates.TemplateResponse("profiles.html", {
            "request": request,
            "profiles": profiles,
            "page": page,
            "pages": pages,
            "total": total,
            "search": search or "",
            "order_by": order_by,
            "flagged": flagged,
            "page_title": "Профили",
        })
    except Exception as e:
        return templates.TemplateResponse("profiles.html", {
            "request": request,
            "profiles": [],
            "page": 1,
            "pages": 0,
            "total": 0,
            "error": str(e),
            "page_title": "Профили",
        })


@router.get("/profile/{profile_id}", response_class=HTMLResponse)
async def profile_detail(
    request: Request,
    profile_id: int,
    _: bool = Depends(require_admin),
):
    """Profile detail with check history"""
    try:
        async with db.session() as session:
            profile = await profile_service.get_profile_by_id(session, profile_id)
            if not profile:
                return HTMLResponse("Профиль не найден", status_code=404)

            checks = await check_service.get_profile_checks(session, profile_id, limit=100)

        return templates.TemplateResponse("profile_detail.html", {
            "request": request,
            "profile": profile,
            "checks": checks,
            "page_title": f"Профиль #{profile_id}",
        })
    except Exception as e:
        return HTMLResponse(f"Ошибка: {e}", status_code=500)


# === History ===

@router.get("/history", response_class=HTMLResponse)
async def history_list(
    request: Request,
    page: int = Query(1, ge=1),
    _: bool = Depends(require_admin),
):
    """All checks history"""
    limit = 50
    offset = (page - 1) * limit

    try:
        async with db.session() as session:
            checks = await check_service.get_recent_checks(session, limit=limit, offset=offset)
            total = await check_service.get_checks_count(session)

            # Load profiles
            for check in checks:
                if check.profile_id:
                    check.profile = await profile_service.get_profile_by_id(
                        session, check.profile_id
                    )

        pages = (total + limit - 1) // limit

        return templates.TemplateResponse("history.html", {
            "request": request,
            "checks": checks,
            "page": page,
            "pages": pages,
            "total": total,
            "page_title": "История проверок",
        })
    except Exception as e:
        return templates.TemplateResponse("history.html", {
            "request": request,
            "checks": [],
            "page": 1,
            "pages": 0,
            "total": 0,
            "error": str(e),
            "page_title": "История проверок",
        })


# === API Endpoints ===

@router.get("/api/stats")
async def api_stats(_: bool = Depends(require_admin)):
    """Get statistics"""
    async with db.session() as session:
        return await check_service.get_stats(session)


@router.get("/api/profiles")
async def api_profiles(
    limit: int = Query(50, le=200),
    offset: int = Query(0),
    search: str = Query(None),
    _: bool = Depends(require_admin),
):
    """Get profiles list"""
    async with db.session() as session:
        profiles, total = await profile_service.get_profiles(
            session, limit, offset, search=search
        )
        return {
            "profiles": [p.model_dump() for p in profiles],
            "total": total
        }


@router.post("/api/profile/{profile_id}/flag")
async def api_flag_profile(
    profile_id: int,
    flagged: bool = Form(...),
    notes: str = Form(None),
    _: bool = Depends(require_admin),
):
    """Toggle profile flag"""
    async with db.session() as session:
        profile = await profile_service.update_profile_flag(
            session, profile_id, flagged, notes
        )
        if not profile:
            return JSONResponse({"error": "Profile not found"}, status_code=404)
        return {"status": "ok", "is_flagged": profile.is_flagged}
