#!/usr/bin/env bash
# =============================================================================
# APEX (apex.windowasia.com) - Safe Production Deploy Script for Hostinger VPS
# Target Directory: /var/www/Apex
# Usage (Manual SSH or via GitHub Actions):
#   cd /var/www/Apex && bash scripts/deploy-vps.sh
#   APEX_DEPLOY_COMMIT=<40-char-sha> bash scripts/deploy-vps.sh
#
# SAFETY & GOVERNANCE RULES FOR MULTI-APP HOSTINGER VPS (5 Existing Production Apps):
# 1. Locks deployment to the exact verified commit SHA (`APEX_DEPLOY_COMMIT` or `origin/main`).
# 2. Uses explicit project name `-p apex` so Docker Compose ONLY touches
#    `apex-postgres` and `apex-app`.
# 3. Enforces a strict healthcheck loop (fails with `exit 1` if `apex-app` is unhealthy).
# 4. Never stops, restarts, or prunes containers/networks/volumes of other apps.
# =============================================================================
set -euo pipefail

APP_DIR="${APEX_VPS_DIR:-/var/www/Apex}"
BRANCH="${APEX_DEPLOY_BRANCH:-main}"
REQUESTED_COMMIT="${APEX_DEPLOY_COMMIT:-}"

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

echo "[1/5] Fetching & locking verified commit from GitHub (${BRANCH})..."
git fetch origin "${BRANCH}"

if [ -n "${REQUESTED_COMMIT}" ]; then
    if [[ ! "${REQUESTED_COMMIT}" =~ ^[0-9a-fA-F]{40}$ ]]; then
        echo "❌ Error: Invalid APEX_DEPLOY_COMMIT SHA format: ${REQUESTED_COMMIT}"
        exit 1
    fi
    if ! git merge-base --is-ancestor "${REQUESTED_COMMIT}" "origin/${BRANCH}"; then
        echo "❌ Error: Commit ${REQUESTED_COMMIT} is not an ancestor of origin/${BRANCH}!"
        exit 1
    fi
    TARGET_COMMIT="${REQUESTED_COMMIT}"
    git checkout --detach "${TARGET_COMMIT}"
else
    git checkout "${BRANCH}"
    git merge --ff-only "origin/${BRANCH}"
    TARGET_COMMIT="$(git rev-parse HEAD)"
fi

ACTUAL_COMMIT="$(git rev-parse HEAD)"
if [ "${ACTUAL_COMMIT}" != "${TARGET_COMMIT}" ]; then
    echo "❌ Error: Checked out commit (${ACTUAL_COMMIT}) does not match target (${TARGET_COMMIT})!"
    exit 1
fi
echo "  [OK] Locked deployment to verified commit: ${ACTUAL_COMMIT}"

echo "[2/5] Verifying external Traefik network (root_default)..."
if ! docker network inspect root_default >/dev/null 2>&1; then
    echo "⚠️  Network 'root_default' not found. Creating external network 'root_default'..."
    docker network create root_default
else
    echo "  [OK] Existing Traefik network 'root_default' detected."
fi

echo "[3/5] Building & updating ONLY APEX containers (project: apex)..."
docker compose -p apex -f docker-compose.yml up -d --build

echo "[4/5] Verifying APEX container health (strict check)..."
HEALTH_OK=0
for attempt in $(seq 1 15); do
    sleep 2
    HEALTH_JSON="$(docker exec apex-app wget -qO- http://127.0.0.1:3000/api/health 2>/dev/null || true)"
    if echo "${HEALTH_JSON}" | grep -q '"status":"ok"'; then
        HEALTH_OK=1
        echo "  [OK] apex-app healthcheck passed on attempt ${attempt}/15: ${HEALTH_JSON}"
        break
    fi
    echo "  [WAIT] Waiting for apex-app healthcheck (attempt ${attempt}/15)..."
done

docker ps --filter "name=apex-" --format "table {{.Names}}\t{{.Status}}\t{{.Networks}}"

if [ "${HEALTH_OK}" -ne 1 ]; then
    echo "❌ ERROR: apex-app failed healthcheck after 30 seconds! Deployment aborted."
    docker logs --tail 50 apex-app || true
    exit 1
fi

echo "[5/5] Running multi-app safe dangling image cleanup..."
bash "${APP_DIR}/scripts/cleanup-cache.sh"

echo "================================================================="
echo " ✅ APEX Deployment Completed Successfully!"
echo " 🔒 Deployed Commit: ${ACTUAL_COMMIT}"
echo " 🌐 Production URL:  https://apex.windowasia.com"
echo "================================================================="
