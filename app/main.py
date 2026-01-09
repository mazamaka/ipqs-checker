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
from pydantic import BaseModel

# Config
IPQS_API_KEY = os.getenv(
    "IPQS_API_KEY",
    "***REMOVED***"
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


@app.get("/health")
async def health():
    """Health check endpoint"""
    return {"status": "ok", "timestamp": datetime.utcnow().isoformat()}


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
