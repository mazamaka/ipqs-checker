"""
IPQS Device Fingerprint Checker - FastAPI Server
"""

import os
import json
import httpx
from datetime import datetime
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse, JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# Config
IPQS_API_KEY = os.getenv(
    "IPQS_API_KEY",
    "Cj3vYxb1VZH2JWf0tcSCvYQYYDpTUVzrhnbokrjKBwfU27WZkOPIVPU4jKvusri0MQWIKEwDWZtsinjFTdO0Hhh1FHSreV5Jnpzkwv0GNqfA8rAuB5X5R1ybqqrbmKoEYLRUWRekgbYgshv7NvtZLyFKku08TbCeYn13r0sbLioZLjLXNYo6nLRp4SOYCPIMH3dJdLHQ8z7FZL15cTmK2tI1bGbWR16xbdY6W0LwxLmfkf4StKb1qrCavtM4u500"
)
IPQS_DOMAIN = os.getenv("IPQS_DOMAIN", "indeed.com")

# Data directory - /app/data in Docker, ./data locally
if Path("/app/data").exists() or os.getenv("DOCKER"):
    DATA_DIR = Path("/app/data")
else:
    DATA_DIR = Path(__file__).parent.parent / "data"
DATA_DIR.mkdir(exist_ok=True, parents=True)
VISITORS_LOG = DATA_DIR / "visitors.jsonl"

app = FastAPI(
    title="IPQS Device Fingerprint Checker",
    description="Check device fingerprint and fraud score",
    version="1.0.0",
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


@app.get("/health")
async def health():
    """Health check endpoint"""
    return {"status": "ok", "timestamp": datetime.utcnow().isoformat()}


@app.get("/extension/{filename}")
async def get_extension(filename: str):
    """Serve extension files for download"""
    ext_dir = Path(__file__).parent.parent / "extension"
    file_path = ext_dir / filename
    if file_path.exists():
        return FileResponse(file_path, filename=filename)
    return JSONResponse({"error": "File not found"}, status_code=404)


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


@app.post("/api/extension/report")
async def extension_report(request: Request):
    """Receive fingerprint data from browser extension"""
    try:
        data = await request.json()
        session_id = data.get("session_id", "default")
        fingerprint = data.get("fingerprint", {})

        # Count device visits
        device_id = fingerprint.get("device_id", "")
        guid = fingerprint.get("guid", "")
        visit_count = count_device_visits(device_id, guid) if (device_id or guid) else 1

        # Add visit count to fingerprint
        fingerprint["_visit_count"] = visit_count

        extension_reports[session_id] = {
            "fingerprint": fingerprint,
            "timestamp": datetime.utcnow().isoformat(),
            "source": data.get("source", "unknown")
        }

        # Log to visitors file
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
async def clear_visitors():
    """Clear visitors log"""
    if VISITORS_LOG.exists():
        VISITORS_LOG.unlink()
    return {"status": "cleared"}
