---
name: wa-ciam-iso27001
description: Enforces Window Asia Central IAM (CIAM) v2.9.0 Spoke integration standards and ISO/IEC 27001:2022 security controls for APEX (apex.windowasia.com). Activate whenever working on authentication, SSO, user provisioning, RBAC permissions, system_settings, audit logging, or In-App AI Copilot endpoints.
---

# Window Asia CIAM v2.9.0 & ISO/IEC 27001:2022 Skill (`wa-ciam-iso27001`)

Use this skill whenever implementing or modifying security, authentication, user directory sync, RBAC, audit logs, or AI Copilot features in **APEX (`apex.windowasia.com`)**.

Reference specification: `Docs/CIAM_SPOKE_ENTERPRISE_INTEGRATION_SPECIFICATION_v2.9.0.md`

## 1. Zero `.env` Dependency (Mandatory)
- **NEVER** read `CIAM_*` or `AI_COPILOT_*` configurations from `.env` in application code.
- Store and retrieve all CIAM and AI settings from the PostgreSQL `system_settings` table (`ciam_enabled`, `ciam_issuer_url`, `ciam_client_id`, `ciam_client_secret`, `ciam_redirect_uri`, `ciam_management_api_key`, `ciam_allowed_ips`, `break_glass_enabled`, `break_glass_url`, `ai_copilot_enabled`, `ai_provider_url`, `ai_api_key`, `ai_model_name`).
- On every settings update, log `CFG-01` in `transaction_logs`.

## 2. Required Spoke API Groups (Groups A–E)
1. **Group A (Admin Settings):**
   - `GET /api/settings/ciam-sso` & `POST /api/settings/ciam-sso`
   - `POST /api/settings/ciam-sso/test` (Tests `.well-known/openid-configuration` connectivity)
2. **Group B (OAuth2/OIDC + PKCE `S256` + Break-Glass):**
   - `GET /auth/start`: RFC 9700 seamless bounce entry point (`https://apex.windowasia.com/auth/start`)
   - `GET /api/auth/sso/login`: Generates `code_verifier` & `code_challenge` (`S256`) and redirects to `ciam_issuer_url` (or `break_glass_url` `http://172.18.0.1:3100` when `break_glass_enabled == true`)
   - `GET /api/auth/sso/callback`: Exchanges authorization code, verifies RS256 ID Token via JWKS, enforces **Inactive Account Guard (`SSO-04`)**, issues HTTPOnly Secure session
   - `POST /api/auth/sso/logout`: Revokes session and logs `SSO-03`
   - `POST /api/auth/sso/break-glass`: Toggles emergency local/fallback auth and logs `BG-01` / `BG-02`
3. **Group C (Push Directory Provisioning):**
   - `GET/POST/PUT/DELETE /api/v1/directory/accounts*`
   - Must validate `X-Management-API-Key` (constant-time `hmac.compare_digest`) AND source IP against `ciam_allowed_ips` (`157.173.219.153`).
   - Supports `use_ad_auth: false` for external subcontractors (`contractor`) and customers (`customer`).
   - Respects 2-Way Status Sync (`status_origin`: `CIAM` vs `LOCAL`).
4. **Group D (Spoke Pull Agent & Immediate Sync):**
   - Background heartbeat `POST /api/v1/agent/heartbeat` to Central IAM + Admin UI "Immediate Sync Now" trigger (`POST /api/settings/ciam-sso/sync-now`).
5. **Group E (In-App Read-Only AI Copilot):**
   - Must be **100% Read-Only (Zero-Mutation)**, scoped to the current user's RBAC permissions and assigned projects.
   - Must attach `ZERO_TRAINING_PRIVACY_HEADERS` and scrub PII/secrets via `sanitize_context_for_privacy()`.
   - Must hide UI and return `403` when `ai_copilot_enabled == false`.

## 3. RBAC & External User Hard-Deny (`EXT_DENY`)
- Enforce 10 roles × 37 permissions + per-user `grant` / `deny` overrides.
- If `user.is_external == true` (or role in `['contractor', 'customer']`), **ALWAYS strip all 17 `EXT_DENY` permissions**, even if explicitly granted in overrides.
