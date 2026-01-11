"""
IPQS Device Fingerprint Checker - FastAPI Server
"""

import os
import io
import json
import zipfile
import httpx
from datetime import datetime
from pathlib import Path
from typing import Optional
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, Depends
from fastapi.responses import HTMLResponse, JSONResponse, FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlmodel.ext.asyncio.session import AsyncSession

# App imports
from app.config import SETTINGS
from app.db import db, get_db
from app.services import profile_service, check_service
from app.admin import admin_router

# Config from settings
IPQS_API_KEY = SETTINGS.ipqs_api_key
IPQS_DOMAIN = SETTINGS.ipqs_domain
ADMIN_TOKEN = SETTINGS.admin_token

if not IPQS_API_KEY:
    print("[WARN] IPQS_API_KEY not set, some features will not work")

# Data directory - /app/data in Docker, ./data locally
if Path("/app/data").exists() or os.getenv("DOCKER"):
    DATA_DIR = Path("/app/data")
else:
    DATA_DIR = Path(__file__).parent.parent / "data"
DATA_DIR.mkdir(exist_ok=True, parents=True)
VISITORS_LOG = DATA_DIR / "visitors.jsonl"


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan - startup and shutdown"""
    # Startup
    print("[DB] Initializing database...")
    try:
        await db.init_models()
        print("[DB] Database initialized successfully")
    except Exception as e:
        print(f"[DB] Database initialization error: {e}")
        print("[DB] Running without database - results will not be persisted")

    yield

    # Shutdown
    print("[DB] Closing database connections...")
    await db.dispose()


app = FastAPI(
    title="IPQS Device Fingerprint Checker",
    description="Check device fingerprint and fraud score",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS for extension
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Static files
STATIC_DIR = Path(__file__).parent.parent / "static"
if STATIC_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


class IPQSLog(BaseModel):
    """IPQS result for logging"""
    fraud_chance: Optional[int] = None
    ip_address: Optional[str] = None
    country: Optional[str] = None
    device_id: Optional[str] = None
    guid: Optional[str] = None
    canvas_hash: Optional[str] = None
    webgl_hash: Optional[str] = None
    # ... all other fields will be stored as-is


@app.get("/", response_class=HTMLResponse)
async def index():
    """Main page with fingerprint checker"""
    html_file = STATIC_DIR / "index.html"
    if html_file.exists():
        return HTMLResponse(content=html_file.read_text())
    return HTMLResponse(content="<h1>IPQS Checker</h1><p>Static files not found</p>")


@app.get("/result", response_class=HTMLResponse)
async def result_page():
    """Result page for extension redirect"""
    html_file = STATIC_DIR / "result.html"
    if html_file.exists():
        return HTMLResponse(content=html_file.read_text())
    return HTMLResponse(content="<h1>Results</h1><p>Page not found</p>")


@app.get("/result-fp", response_class=HTMLResponse)
async def result_fp_page():
    """Result page for Fingerprint Pro"""
    html_file = STATIC_DIR / "result-fp.html"
    if html_file.exists():
        return HTMLResponse(content=html_file.read_text())
    return HTMLResponse(content="<h1>Fingerprint Pro Results</h1><p>Page not found</p>")


@app.get("/health")
async def health():
    """Health check endpoint"""
    return {"status": "ok", "timestamp": datetime.utcnow().isoformat()}


@app.get("/extension/{filename}")
async def get_extension(filename: str):
    """Serve extension files for download"""
    ext_dir = Path(__file__).parent.parent / "extension"
    file_path = (ext_dir / filename).resolve()

    # Защита от path traversal
    if not str(file_path).startswith(str(ext_dir.resolve())):
        return JSONResponse({"error": "Invalid path"}, status_code=400)

    if file_path.exists() and file_path.is_file():
        return FileResponse(file_path, filename=filename)
    return JSONResponse({"error": "File not found"}, status_code=404)


@app.get("/dist/{filename}")
async def get_dist_file(filename: str):
    """Serve packaged extensions from dist folder"""
    dist_dir = Path(__file__).parent.parent / "dist"
    file_path = (dist_dir / filename).resolve()

    # Защита от path traversal
    if not str(file_path).startswith(str(dist_dir.resolve())):
        return JSONResponse({"error": "Invalid path"}, status_code=400)

    if file_path.exists() and file_path.is_file():
        return FileResponse(file_path, filename=filename)
    return JSONResponse({"error": "File not found"}, status_code=404)


@app.get("/download/extension-chrome.zip")
async def download_chrome_extension():
    """Generate Chrome extension zip on-the-fly from source files"""
    ext_dir = Path(__file__).parent.parent / "extension-chrome"

    if not ext_dir.exists():
        return JSONResponse({"error": "Extension directory not found"}, status_code=404)

    # Create zip in memory
    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        for file_path in ext_dir.rglob("*"):
            if file_path.is_file() and not file_path.name.startswith("."):
                arcname = file_path.relative_to(ext_dir)
                zf.write(file_path, arcname)

    zip_buffer.seek(0)

    return StreamingResponse(
        zip_buffer,
        media_type="application/zip",
        headers={"Content-Disposition": "attachment; filename=ipqs-checker-chrome.zip"}
    )


@app.get("/download/extension-firefox.xpi")
async def download_firefox_extension():
    """Generate Firefox extension xpi on-the-fly from source files"""
    ext_dir = Path(__file__).parent.parent / "extension"

    if not ext_dir.exists():
        return JSONResponse({"error": "Extension directory not found"}, status_code=404)

    # Create xpi (zip) in memory, excluding pre-built archives
    zip_buffer = io.BytesIO()
    exclude_ext = {".xpi", ".zip"}

    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        for file_path in ext_dir.rglob("*"):
            if (file_path.is_file() and
                not file_path.name.startswith(".") and
                file_path.suffix.lower() not in exclude_ext):
                arcname = file_path.relative_to(ext_dir)
                zf.write(file_path, arcname)

    zip_buffer.seek(0)

    return StreamingResponse(
        zip_buffer,
        media_type="application/x-xpinstall",
        headers={"Content-Disposition": "attachment; filename=ipqs-checker-firefox.xpi"}
    )


@app.get("/api/config")
async def get_config():
    """Get IPQS configuration for frontend"""
    return {
        "api_url": "/ipqs"  # Use patched proxy
    }


@app.get("/ipqs/{path:path}")
async def ipqs_proxy(path: str, request: Request):
    """Reverse proxy for IPQS to bypass fn.fn bug"""
    url = f"https://fn.us.ipqscdn.com/api/{IPQS_DOMAIN}/{IPQS_API_KEY}/{path}"

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(url)
            content = resp.content
            content_type = resp.headers.get("content-type", "application/octet-stream")

            # Patch learn.js to fix fn.fn bug
            if path == "learn.js" and b"fn.us.ipqscdn.com" in content:
                # Replace any occurrence that might cause fn.fn
                content = content.replace(
                    b'fn."+"us.ipqscdn.com',
                    b'us.ipqscdn.com'
                )
                content = content.replace(
                    b"fn.us.ipqscdn.com",
                    b"us.ipqscdn.com"
                )
                # Also replace in case it's building URL differently
                content = content.replace(
                    b'"fn."',
                    b'""'
                )

            from fastapi.responses import Response
            return Response(
                content=content,
                media_type=content_type,
                headers={"Access-Control-Allow-Origin": "*"}
            )
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


@app.post("/ipqs/{path:path}")
async def ipqs_proxy_post(path: str, request: Request):
    """Reverse proxy POST for IPQS"""
    url = f"https://fn.us.ipqscdn.com/api/{IPQS_DOMAIN}/{IPQS_API_KEY}/{path}"

    # Get real client IP
    client_ip = (
        request.headers.get("x-forwarded-for", "").split(",")[0].strip() or
        request.headers.get("x-real-ip") or
        (request.client.host if request.client else None)
    )

    try:
        body = await request.body()
        headers = {
            "Content-Type": request.headers.get("content-type", "application/json"),
            "User-Agent": request.headers.get("user-agent", ""),
            "X-Forwarded-For": client_ip,
            "X-Real-IP": client_ip,
        }

        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(url, content=body, headers=headers)

            content_type = resp.headers.get("content-type", "application/json")
            from fastapi.responses import Response
            return Response(
                content=resp.content,
                media_type=content_type,
                headers={"Access-Control-Allow-Origin": "*"}
            )
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


# Store for extension reports (in-memory, use Redis in production)
extension_reports = {}


def count_device_visits(device_id: str, guid: str) -> int:
    """Count how many times this device was seen"""
    if not VISITORS_LOG.exists():
        return 1

    count = 0
    with open(VISITORS_LOG) as f:
        for line in f:
            if line.strip():
                try:
                    entry = json.loads(line)
                    ipqs = entry.get("ipqs", {})
                    if ipqs.get("device_id") == device_id or ipqs.get("guid") == guid:
                        count += 1
                except json.JSONDecodeError:
                    continue
    return count + 1  # +1 for current visit


def is_fingerprint_unique(canvas_hash: str, webgl_hash: str, device_id: str) -> bool:
    """Check if this fingerprint combination was seen before"""
    if not VISITORS_LOG.exists():
        return True

    if not canvas_hash and not webgl_hash and not device_id:
        return True

    with open(VISITORS_LOG) as f:
        for line in f:
            if line.strip():
                try:
                    entry = json.loads(line)
                    ipqs = entry.get("ipqs", {})

                    # Check by device_id first (most reliable)
                    if device_id and ipqs.get("device_id") == device_id:
                        return False

                    # Check by canvas + webgl combination
                    if canvas_hash and webgl_hash:
                        if (ipqs.get("canvas_hash") == canvas_hash and
                            ipqs.get("webgl_hash") == webgl_hash):
                            return False

                except json.JSONDecodeError:
                    continue

    return True


@app.post("/api/extension/report")
async def extension_report(request: Request):
    """Receive fingerprint data from browser extension"""
    try:
        data = await request.json()
        session_id = data.get("session_id", "default")
        fingerprint = data.get("fingerprint", {})
        source = data.get("source", "unknown")

        # Extract fingerprint data
        device_id = fingerprint.get("device_id", "")
        guid = fingerprint.get("guid", "")
        canvas_hash = fingerprint.get("canvas_hash", "")
        webgl_hash = fingerprint.get("webgl_hash", "")

        # Try to save to database
        profile_id = None
        check_id = None
        visit_count = 1
        fingerprint_unique = True

        try:
            async with db.session() as db_session:
                # Get or create profile
                profile = await profile_service.get_or_create_profile(
                    db_session,
                    canvas_hash=canvas_hash,
                    webgl_hash=webgl_hash,
                    device_id=device_id,
                )

                # Add source to fingerprint data
                fingerprint["source"] = source

                # Create check record
                check = await check_service.create_check(
                    db_session,
                    profile.id,
                    fingerprint,
                    session_id,
                )

                # Update profile stats
                await profile_service.update_profile_from_check(
                    db_session,
                    profile,
                    fingerprint,
                )

                profile_id = profile.id
                check_id = check.id
                visit_count = profile.check_count
                fingerprint_unique = profile.check_count == 1

                print(f"[DB] Saved check {check_id} for profile {profile_id}")
        except Exception as db_error:
            print(f"[DB] Error saving to database: {db_error}")
            # Fallback to file-based counting
            visit_count = count_device_visits(device_id, guid) if (device_id or guid) else 1
            fingerprint_unique = is_fingerprint_unique(canvas_hash, webgl_hash, device_id)

        # Add visit count and uniqueness to fingerprint
        fingerprint["_visit_count"] = visit_count
        fingerprint["_fingerprint_unique"] = fingerprint_unique

        # Store in memory for quick access from result page
        extension_reports[session_id] = {
            "fingerprint": fingerprint,
            "timestamp": datetime.utcnow().isoformat(),
            "source": source,
            "profile_id": profile_id,
            "check_id": check_id,
        }

        # Also log to visitors file (backup)
        log_entry = {
            "timestamp": datetime.utcnow().isoformat(),
            "session_id": session_id,
            "ipqs": fingerprint
        }
        with open(VISITORS_LOG, "a") as f:
            f.write(json.dumps(log_entry, ensure_ascii=False) + "\n")

        print(f"[EXT] Received fingerprint for session {session_id}, visit #{visit_count}")
        return {"status": "ok"}
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=400)


@app.get("/api/extension/result/{session_id}")
async def extension_result(session_id: str):
    """Get fingerprint result for session"""
    if session_id in extension_reports:
        return extension_reports[session_id]
    return {"status": "pending"}


# Store for Fingerprint Pro reports
fingerprint_reports = {}


@app.post("/api/extension/report-fp")
async def extension_report_fp(request: Request):
    """Receive Fingerprint Pro data from browser extension"""
    try:
        data = await request.json()
        session_id = data.get("session_id", "default")
        fingerprint = data.get("fingerprint", {})
        source = data.get("source", "unknown")

        # Extract key identifiers from Fingerprint Pro response
        products = fingerprint.get("products", {})
        identification = products.get("identification", {}).get("data", {})
        tampering = products.get("tampering", {}).get("data", {})
        suspect_score = products.get("suspectScore", {}).get("data", {})
        bot_d = products.get("botd", {}).get("data", {})
        ip_info = products.get("ipInfo", {}).get("data", {})
        vpn = products.get("vpn", {}).get("data", {})

        visitor_id = identification.get("visitorId", "")
        request_id = identification.get("requestId", "")
        confidence = identification.get("confidence", {}).get("score", 0)
        anti_detect = tampering.get("antiDetectBrowser", False)
        suspect = suspect_score.get("result", 0)

        # Store in memory for quick access
        fingerprint_reports[session_id] = {
            "fingerprint": fingerprint,
            "timestamp": datetime.utcnow().isoformat(),
            "source": source,
            "summary": {
                "visitor_id": visitor_id,
                "request_id": request_id,
                "confidence": confidence,
                "anti_detect_browser": anti_detect,
                "suspect_score": suspect,
                "is_bot": bot_d.get("bot", {}).get("result") == "bad" if bot_d.get("bot") else False,
            }
        }

        # Also store in extension_reports for unified access
        extension_reports[session_id] = fingerprint_reports[session_id]

        # Log to visitors file (backup)
        log_entry = {
            "timestamp": datetime.utcnow().isoformat(),
            "session_id": session_id,
            "service": "fingerprint_pro",
            "visitor_id": visitor_id,
            "anti_detect": anti_detect,
            "suspect_score": suspect,
            "confidence": confidence,
        }
        with open(VISITORS_LOG, "a") as f:
            f.write(json.dumps(log_entry, ensure_ascii=False) + "\n")

        print(f"[FP] Received Fingerprint Pro for session {session_id}")
        print(f"[FP] Visitor ID: {visitor_id}, Anti-detect: {anti_detect}, Suspect: {suspect}")

        return {"status": "ok"}
    except Exception as e:
        print(f"[FP] Error: {e}")
        return JSONResponse({"error": str(e)}, status_code=400)


@app.get("/api/proxy/fetch")
async def proxy_fetch():
    """Proxy IPQS fetch to bypass CORS issues"""
    url = f"https://fn.us.ipqscdn.com/api/{IPQS_DOMAIN}/{IPQS_API_KEY}/learn/fetch"
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(url)
            return resp.json()
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


@app.post("/api/log")
async def log_visitor(request: Request):
    """Log visitor fingerprint data"""
    try:
        data = await request.json()

        log_entry = {
            "timestamp": datetime.utcnow().isoformat(),
            "client_ip": request.client.host if request.client else "unknown",
            "user_agent": request.headers.get("user-agent", ""),
            "ipqs": data
        }

        # Append to log file
        with open(VISITORS_LOG, "a") as f:
            f.write(json.dumps(log_entry, ensure_ascii=False) + "\n")

        ip = data.get("ip_address", "?")
        fraud = data.get("fraud_chance", "?")
        print(f"[LOG] {ip} - fraud: {fraud}%")

        return {"status": "ok"}

    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=400)


@app.get("/api/visitors")
async def get_visitors(limit: int = 100):
    """Get list of logged visitors"""
    visitors = []

    if VISITORS_LOG.exists():
        with open(VISITORS_LOG) as f:
            for line in f:
                if line.strip():
                    try:
                        visitors.append(json.loads(line))
                    except json.JSONDecodeError:
                        continue

    # Return last N visitors, newest first
    return visitors[-limit:][::-1]


@app.get("/api/visitors/stats")
async def get_visitor_stats():
    """Get visitor statistics"""
    visitors = []

    if VISITORS_LOG.exists():
        with open(VISITORS_LOG) as f:
            for line in f:
                if line.strip():
                    try:
                        visitors.append(json.loads(line))
                    except json.JSONDecodeError:
                        continue

    if not visitors:
        return {"total": 0}

    # Calculate stats
    fraud_scores = [v.get("ipqs", {}).get("fraud_chance", 0) for v in visitors]
    countries = {}
    for v in visitors:
        country = v.get("ipqs", {}).get("country", "Unknown")
        countries[country] = countries.get(country, 0) + 1

    return {
        "total": len(visitors),
        "avg_fraud_score": round(sum(fraud_scores) / len(fraud_scores), 1) if fraud_scores else 0,
        "max_fraud_score": max(fraud_scores) if fraud_scores else 0,
        "min_fraud_score": min(fraud_scores) if fraud_scores else 0,
        "countries": dict(sorted(countries.items(), key=lambda x: -x[1])[:10]),
        "unique_ips": len(set(v.get("ipqs", {}).get("ip_address") for v in visitors)),
    }


@app.delete("/api/visitors")
async def clear_visitors(request: Request):
    """Clear visitors log (requires ADMIN_TOKEN)"""
    # Проверка авторизации
    auth = request.headers.get("Authorization", "")
    if not ADMIN_TOKEN or auth != f"Bearer {ADMIN_TOKEN}":
        return JSONResponse({"error": "Unauthorized"}, status_code=401)

    if VISITORS_LOG.exists():
        VISITORS_LOG.unlink()
    return {"status": "cleared"}


# Mount admin router
app.include_router(admin_router)
