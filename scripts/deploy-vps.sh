#!/usr/bin/env bash
# =============================================================================
# APEX (apex.windowasia.com) - Safe Production Deploy Script for Hostinger VPS
# Target Directory: /var/www/Apex
# Usage (Manual SSH or via GitHub Actions):
#   cd /var/www/Apex && bash scripts/deploy-vps.sh
#
# SAFETY RULES FOR MULTI-APP HOSTINGER VPS (5 Existing Production Apps):
# 1. Uses explicit project name `-p apex` so Docker Compose ONLY touches
#    `apex-postgres` and `apex-app`.
# 2. Never stops, restarts, or prunes containers/networks/volumes of other apps.
# 3. Cleans up only dangling (<none>) images created during the new build.
# =============================================================================
set -euo pipefail

APP_DIR="${APEX_VPS_DIR:-/var/www/Apex}"
BRANCH="${APEX_DEPLOY_BRANCH:-main}"

echo "================================================================="
echo " 🚀 Deploying APEX (apex.windowasia.com) on Hostinger VPS"
echo " 📁 Directory: ${APP_DIR}"
echo " 🌿 Branch:    ${BRANCH}"
echo " 🕒 Time:      $(date '+%Y-%m-%d %H:%M:%S')"
echo "================================================================="

if [ ! -d "${APP_DIR}" ]; then
    echo "❌ Error: Directory ${APP_DIR} does not exist."
    echo "💡 First-time setup on Hostinger VPS:"
    echo "   git clone https://github.com/ITWA-PCL/apex.git ${APP_DIR}"
    exit 1
fi

cd "${APP_DIR}"

echo "[1/5] Fetching latest code from GitHub (${BRANCH})..."
git fetch origin "${BRANCH}"
git checkout "${BRANCH}"
git pull origin "${BRANCH}"

echo "[2/5] Verifying external Traefik network (root_default)..."
if ! docker network inspect root_default >/dev/null 2>&1; then
    echo "⚠️  Network 'root_default' not found. Creating external network 'root_default'..."
    docker network create root_default
else
    echo "  [OK] Existing Traefik network 'root_default' detected."
fi

echo "[3/5] Building & updating ONLY APEX containers (project: apex)..."
docker compose -p apex -f docker-compose.yml up -d --build

echo "[4/5] Verifying APEX container health..."
sleep 5
docker ps --filter "name=apex-" --format "table {{.Names}}\t{{.Status}}\t{{.Networks}}"

if docker exec apex-app wget -qO- http://127.0.0.1:3000/api/health >/dev/null 2>&1; then
    echo "  [OK] apex-app healthcheck passed (http://127.0.0.1:3000/api/health)"
else
    echo "  [INFO] Waiting additional 5s for apex-app startup..."
    sleep 5
    docker logs --tail 20 apex-app || true
fi

echo "[5/5] Running multi-app safe dangling image cleanup..."
bash "${APP_DIR}/scripts/cleanup-cache.sh"

echo "================================================================="
echo " ✅ APEX Deployment Completed Successfully!"
echo " 🌐 Production URL: https://apex.windowasia.com"
echo "================================================================="
