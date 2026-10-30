#!/usr/bin/env bash
# =============================================================================
# APEX (apex.windowasia.com) - Multi-App Safe Docker & Cache Cleanup (Hostinger VPS)
# Server Path: /var/www/Apex
# Cron schedule suggestion (Every Sunday at 03:00 AM):
# 0 3 * * 0 /var/www/Apex/scripts/cleanup-cache.sh >> /var/log/apex-cache-cleanup.log 2>&1
#
# MULTI-APP SAFETY GUARANTEE (5+ Production Apps on the same Hostinger VPS):
# - NEVER runs `docker container prune`, `docker network prune`, `docker volume prune`,
#   or `docker image prune -a` so other apps on the VPS are 100% untouched.
# - ONLY removes untagged (<none>:<none>) dangling images and expired build cache.
# =============================================================================
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "================================================================="
echo " APEX Multi-App Safe Cache Cleanup (/var/www/Apex)"
echo " Started at: $(date '+%Y-%m-%d %H:%M:%S')"
echo "================================================================="

if command -v docker >/dev/null 2>&1; then
    echo "[1/3] Removing ONLY untagged (<none>:<none>) dangling Docker images..."
    docker image prune --force || true

    echo "[2/3] Pruning expired Docker BuildKit cache (>24h old)..."
    docker builder prune --force --filter "until=24h" || true
    docker buildx prune --force --filter "until=24h" 2>/dev/null || true

    echo "--- Current Docker Disk Usage ---"
    docker system df || true
fi

echo "[3/3] Cleaning local temporary caches inside ${PROJECT_ROOT}..."
rm -rf "${PROJECT_ROOT}/app/.cache" "${PROJECT_ROOT}/frontend/.next/cache" "${PROJECT_ROOT}/frontend/.turbo" 2>/dev/null || true

echo "================================================================="
echo " Safe Cleanup Completed at: $(date '+%Y-%m-%d %H:%M:%S')"
echo "================================================================="
