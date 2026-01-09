#!/bin/bash
set -e

echo "Starting IPQS Checker..."

exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers ${WORKERS:-1}
