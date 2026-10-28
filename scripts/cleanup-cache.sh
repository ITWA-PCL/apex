#!/usr/bin/env bash
# =============================================================================
# APEX (apex.windowasia.com) - Weekly Docker & Build Cache Cleanup (Linux Cloud)
# Cron schedule suggestion (Every Sunday at 03:00 AM):
# 0 3 * * 0 /opt/apex/scripts/cleanup-cache.sh >> /var/log/apex-cache-cleanup.log 2>&1
# =============================================================================
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "================================================================="
echo " APEX Weekly Cache & Build Garbage Cleanup"
echo " Started at: $(date '+%Y-%m-%d %H:%M:%S')"
echo "================================================================="

if command -v docker >/dev/null 2>&1; then
    echo "[1/4] Pruning Docker Builder / BuildKit Cache..."
    docker builder prune --all --force || true
    docker buildx prune --all --force 2>/dev/null || true

    echo "[2/4] Pruning Dangling Docker Images, Stopped Containers & Unused Networks (Volumes Preserved)..."
    docker image prune --force || true
    docker container prune --force || true
    docker network prune --force || true

    echo "--- Docker Disk Usage After Prune ---"
    docker system df || true
fi

echo "[3/4] Cleaning Frontend Next.js & Turbo caches..."
rm -rf "${PROJECT_ROOT}/frontend/.next/cache" "${PROJECT_ROOT}/frontend/.turbo" 2>/dev/null || true

echo "[4/4] Cleaning Backend Python bytecode & test caches..."
find "${PROJECT_ROOT}" \
    -not -path "*/node_modules/*" \
    -not -path "*/.venv/*" \
    -type d \( -name "__pycache__" -o -name ".pytest_cache" -o -name ".mypy_cache" -o -name ".ruff_cache" \) \
    -exec rm -rf {} + 2>/dev/null || true

echo "================================================================="
echo " Cleanup Completed at: $(date '+%Y-%m-%d %H:%M:%S')"
echo "================================================================="
