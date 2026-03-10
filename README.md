# IPQS Fingerprint Checker

A service for checking device fingerprints through the IPQS API with support for both Firefox and Chrome/Octo Browser extensions.

**Live Demo:** [check.maxbob.xyz](https://check.maxbob.xyz/) · **Admin Panel:** [check.maxbob.xyz/admin](https://check.maxbob.xyz/admin)

## Overview

IPQS Fingerprint Checker allows you to verify the quality of browser profiles by analyzing device fingerprints, fraud scores, and potential detection risks. This tool is particularly useful for validating antidetect browser sessions before use.

## Features

- **FastAPI Backend** — High-performance API server with async/await support
- **Chrome/Octo Extension** (Manifest V3) — Modern extension for Octo Browser and Chrome
- **Firefox Extension** (Manifest V2) — Legacy support for Firefox
- **PostgreSQL Database** — Persistent storage with async query support
- **Admin Dashboard** — Monitoring and profile management interface
- **Device Fingerprinting** — Canvas, WebGL, and hardware-based identification
- **Fraud Detection** — Real-time risk scoring and anomaly detection

## Architecture

```
┌──────────────┐
│ Browser      │
│ Extension    │
└──────┬───────┘
       │ IPQS fingerprint data
       ▼
┌──────────────────────────────┐
│ FastAPI Backend              │
│ ├── /api/extension/report    │
│ └── /api/extension/result    │
└──────┬───────────────────────┘
       │
       ▼
┌──────────────────────┐
│ PostgreSQL           │
│ ├── profiles         │
│ ├── checks           │
│ └── indices          │
└──────────────────────┘

Browser → Extension intercepts IPQS data
         → Sends to backend API
         → Stored in PostgreSQL
         → Results displayed on dashboard
```

## Quick Start

### Docker (Recommended)

```bash
# Clone repository
git clone https://github.com/yourusername/ipqs-checker.git
cd ipqs-checker

# Create .env file
cp .env.example .env
# Edit .env with your PostgreSQL credentials

# Start services
docker-compose up -d

# Check health
curl http://localhost:8000/health
```

### Local Development

```bash
# Install dependencies
pip install -r requirements.txt

# Setup PostgreSQL and create .env file
export POSTGRES_HOST=127.0.0.1

# Run server
uvicorn app.main:app --reload --port 8000
```

## API Endpoints

### Main Pages

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | Home page with instructions |
| GET | `/result` | Results display page |
| GET | `/health` | Health check endpoint |

### Extension API

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/extension/report` | Receive fingerprint data from extension |
| GET | `/api/extension/result/{session_id}` | Get check results for session |

### Admin Panel

| Method | Path | Description |
|--------|------|-------------|
| GET | `/admin` | Dashboard and statistics |
| GET | `/admin/profiles` | List of profiles |
| GET | `/admin/profile/{id}` | Profile details and history |
| GET | `/admin/history` | All checks history |
| POST | `/admin/api/profile/{id}/flag` | Mark profile as suspicious |

## Extension Installation

### Chrome / Octo Browser (Recommended)

1. Open `chrome://extensions/`
2. Enable **"Developer mode"** (top right)
3. Click **"Load unpacked"**
4. Select the `extension-chrome/` folder
5. Pin the extension to your toolbar

### Firefox

1. Open `about:debugging#/runtime/this-firefox`
2. Click **"Load Temporary Add-on..."**
3. Select `extension/manifest.json`

> Note: Temporary extensions are removed on Firefox restart. For permanent installation, use the packaged `.xpi` file.

## Configuration

Create a `.env` file in the project root:

```bash
# PostgreSQL Connection
POSTGRES_HOST=db              # "db" in Docker, "127.0.0.1" locally
POSTGRES_PORT=5432
POSTGRES_USER=ipqs_user
POSTGRES_PASSWORD=your_secure_password
POSTGRES_DB=ipqs_checker

# Admin Panel
ADMIN_PASSWORD=your_admin_password
ADMIN_TOKEN_SECRET=your_random_secret_key

# Server
PORT=8000
WORKERS=1

# IPQS Configuration
IPQS_DOMAIN=indeed.com        # Domain for fingerprint checks
```

## Project Structure

```
ipqs-checker/
├── app/                       # FastAPI application
│   ├── main.py               # Server entry point
│   ├── config.py             # Pydantic settings
│   ├── db/
│   │   ├── database.py       # AsyncEngine and connection pooling
│   │   └── deps.py           # Database dependency injection
│   ├── models/
│   │   ├── profile.py        # Profile model (fingerprints)
│   │   └── check.py          # Check model (verification results)
│   ├── services/
│   │   ├── profile_service.py # Profile CRUD operations
│   │   └── check_service.py   # Check CRUD and statistics
│   └── admin/
│       ├── auth.py            # JWT authentication
│       ├── routes.py          # Admin endpoints
│       └── templates/         # Jinja2 templates
├── extension/                 # Firefox extension (Manifest V2)
│   ├── manifest.json
│   ├── background.js         # webRequest API interception
│   ├── content.js
│   ├── popup.html / popup.js
│   └── ipqs-checker.xpi
├── extension-chrome/          # Chrome/Octo extension (Manifest V3)
│   ├── manifest.json
│   ├── background.js         # Service Worker
│   ├── content.js            # Script injector
│   ├── injected.js           # Fetch/XHR interceptor
│   └── popup.html / popup.js
├── static/
│   ├── index.html            # Home page
│   └── result.html           # Results page
├── docker-compose.yml
├── Dockerfile
└── requirements.txt
```

## Result Interpretation

| Indicator | Good | Bad |
|-----------|------|-----|
| Fraud Score | < 30% | > 70% |
| Fingerprint Unique | Yes | No (exposed) |
| Visit Count | 1 | > 3 |
| OS Mismatch | No | Yes |
| Proxy/VPN Detected | No | Yes |
| Bot Status | No | Yes |
| Recent Abuse | No | Yes |

**Fraud Score Guide:**
- **0-25%**: Clean profile, safe to use
- **25-50%**: Low risk, monitor for changes
- **50-75%**: Moderate risk, potential detection
- **75-100%**: High risk, profile likely detected

## How It Works

### Data Flow

1. User clicks "Check" button in extension popup
2. Extension clears Indeed.com cookies and data
3. Opens `https://secure.indeed.com/auth`
4. Extension intercepts IPQS API response from Indeed
5. Fingerprint data is extracted and sent to backend
6. Backend stores profile and check result in PostgreSQL
7. Results are displayed on the results page

### Key Components

**Profile Model**: Stores unique fingerprints identified by:
- Canvas hash
- WebGL hash
- Device ID
- IP address and geolocation

**Check Model**: Individual verification result containing:
- Fraud score (0-100)
- Device type and OS
- Browser information
- VPN/Proxy detection status
- Geographic and ISP details

## Technologies

- **Backend**: Python 3.11+, FastAPI, Uvicorn
- **Database**: PostgreSQL 16, asyncpg
- **ORM**: SQLModel, SQLAlchemy
- **Frontend**: HTML, JavaScript, Jinja2
- **Extensions**: Manifest V2 (Firefox), Manifest V3 (Chrome)
- **Containerization**: Docker, Docker Compose

## Development

### Running Tests

```bash
# Install test dependencies
pip install pytest pytest-asyncio httpx

# Run tests
pytest
```

### Code Quality

```bash
# Format code
black app/

# Lint
ruff check app/

# Type checking
mypy app/ --strict
```

## Database Schema

### profiles table
- `fingerprint_hash` (unique) — SHA256 of canvas + WebGL + device_id
- `fraud_score` — Latest risk score
- `check_count` — Total verification count
- `is_flagged` — Manual flagging for review
- `first_seen`, `last_seen` — Timestamp tracking

### checks table
- `session_id` — Unique verification session
- `profile_id` — Foreign key to profile
- `fraud_chance` — Risk percentage
- `proxy`, `vpn`, `tor` — Detection flags
- `raw_response` — Complete IPQS API response

## Troubleshooting

### Extension not intercepting data

1. Verify Indeed.com is accessible
2. Check extension console: `chrome://extensions` → Inspect
3. Confirm server is running: `curl http://localhost:8000/health`

### Database connection errors

- Verify `POSTGRES_HOST`: Use `db` in Docker, `127.0.0.1` locally
- Check database container: `docker-compose ps`
- Review logs: `docker-compose logs db`

### Results not displaying

- Check browser console for JavaScript errors
- Verify API response: `curl http://localhost:8000/api/extension/result/{session_id}`
- Ensure PostgreSQL has data: Check admin panel

## License

MIT License - see LICENSE file for details

## Contributing

Contributions are welcome! Please ensure code passes linting and type checking before submitting PRs.

## Support

For issues and feature requests, please create a GitHub issue.
