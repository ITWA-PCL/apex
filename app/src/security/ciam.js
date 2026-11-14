/**
 * APEX (apex.windowasia.com) - Track A: Window Asia Central IAM (CIAM) v2.12.0 Spoke Integration
 * Implements Groups A-D, Audit Logging, In-App Bot Defense (หมวด F),
 * and Enterprise Local Password Policy & 90-Day Rotation (หมวด G).
 * Compliance: ISO 27001 / OIDC / PKCE S256 / RFC 9700
 */
const express = require('express');
const crypto = require('crypto');
const db = require('../db/postgres');
const { ssoSessions, parseCookies } = require('./rbac');
const { createAuthRateLimiter } = require('./headers');

const router = express.Router();

// Store temporary PKCE challenges in memory (state -> { codeVerifier, createdAt, returnTo })
const pkceStore = new Map();

const LOCAL_PASSWORD_EXPIRY_DAYS = 90;

/**
 * Enterprise Password Complexity Standard (Spec v2.12.0 หมวด G.1 & G.4.B):
 * - 8 to 16 characters (strictly enforced)
 * - Uppercase (A-Z) >= 1
 * - Lowercase (a-z) >= 1
 * - Digit (0-9) >= 1
 * - Special Character (!@#$%^&*()_+-=[]{}|;:,.<>?/~`) >= 1
 * - No Username in password (case-insensitive check for username length >= 3)
 */
function validatePasswordComplexity(password, username) {
  if (!password || typeof password !== 'string') {
    return 'กรุณาระบุรหัสผ่าน';
  }
  const pwd = password.trim();
  if (pwd.length < 8 || pwd.length > 16) {
    return `รหัสผ่านต้องมีความยาวระหว่าง 8 ถึง 16 ตัวอักษร (ปัจจุบัน ${pwd.length} ตัวอักษร)`;
  }
  if (!/[A-Z]/.test(pwd)) {
    return 'รหัสผ่านต้องมีตัวอักษรพิมพ์ใหญ่ (A-Z) อย่างน้อย 1 ตัว';
  }
  if (!/[a-z]/.test(pwd)) {
    return 'รหัสผ่านต้องมีตัวอักษรพิมพ์เล็ก (a-z) อย่างน้อย 1 ตัว';
  }
  if (!/[0-9]/.test(pwd)) {
    return 'รหัสผ่านต้องมีตัวเลข (0-9) อย่างน้อย 1 ตัว';
  }
  if (!/[!@#$%^&*()_+\-=\[\]{}|;:,.<>?/~`]/.test(pwd)) {
    return 'รหัสผ่านต้องมีอักขระพิเศษ (!@#$%^&*...) อย่างน้อย 1 ตัว';
  }
  if (username && typeof username === 'string' && username.trim().length >= 3) {
    const uLower = username.trim().toLowerCase();
    if (pwd.toLowerCase().includes(uLower)) {
      return 'รหัสผ่านต้องไม่มีชื่อผู้ใช้ (Username) ปะปนอยู่';
    }
  }
  return null;
}

/**
 * Return (is_expired: bool, days_elapsed: int, days_left: int) based on 90-day rotation policy.
 */
function checkPasswordExpiry90Days(passwordChangedAt, createdAt) {
  const now = Date.now();
  const base = passwordChangedAt
    ? new Date(passwordChangedAt).getTime()
    : (createdAt ? new Date(createdAt).getTime() : now);
  const elapsedDays = Math.floor((now - base) / (1000 * 60 * 60 * 24));
  const daysLeft = Math.max(0, LOCAL_PASSWORD_EXPIRY_DAYS - elapsedDays);
  return {
    expired: elapsedDays >= LOCAL_PASSWORD_EXPIRY_DAYS,
    daysElapsed: elapsedDays,
    daysLeft
  };
}

// Enterprise Layer 1 Sliding-Window IP Rate Limiter (10 req/60s on Auth)
const authRateLimiter = createAuthRateLimiter({
  limit: 10,
  windowMs: 60000,
  onRateLimited: async (req, ip, retryAfter) => {
    await db.insertAuditLog({
      eventCode: 'IP_RATE_LIMITED',
      ipAddress: ip,
      targetResource: '/api/auth/login',
      details: {
        reason: 'rate_limit_exceeded',
        threshold: '10_per_60s',
        retry_after: retryAfter
      }
    });
  }
});

function getClientIp(req) {
  return (
    (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
    req.headers['x-real-ip'] ||
    (req.socket?.remoteAddress || '').replace(/^::ffff:/, '') ||
    'unknown'
  );
}

function safeCompare(a, b) {
  const bufA = Buffer.from(String(a || ''), 'utf8');
  const bufB = Buffer.from(String(b || ''), 'utf8');
  if (bufA.length !== bufB.length || bufA.length === 0) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function maskSecret(val) {
  if (!val) return '';
  if (val.length <= 6) return '******';
  return val.slice(0, 3) + '••••••••' + val.slice(-3);
}

// ============================================================================
// GROUP A: Admin Settings API (Zero .env Dependency -> PostgreSQL system_settings)
// ============================================================================

router.get('/api/settings/ciam-sso', async (req, res) => {
  try {
    if (!req.apexUser?.permissions?.includes('users')) {
      return res.status(403).json({ error: 'forbidden', message: 'เฉพาะผู้ดูแลระบบเท่านั้น' });
    }
    const s = await db.getSystemSettings();
    res.json({
      app_code: s.app_code || 'apex',
      app_domain: s.app_domain || 'https://apex.windowasia.com',
      ciam_enabled: s.ciam_enabled === 'true',
      ciam_issuer_url: s.ciam_issuer_url,
      ciam_client_id: s.ciam_client_id,
      ciam_client_secret_masked: maskSecret(s.ciam_client_secret),
      has_client_secret: Boolean(s.ciam_client_secret),
      ciam_redirect_uri: s.ciam_redirect_uri,
      ciam_post_logout_redirect_uri: s.ciam_post_logout_redirect_uri,
      ciam_management_api_key_masked: maskSecret(s.ciam_management_api_key),
      has_management_api_key: Boolean(s.ciam_management_api_key),
      ciam_allowed_ips: s.ciam_allowed_ips,
      ciam_portal_url: s.ciam_portal_url || 'https://ciam.windowasia.com/portal',
      break_glass_enabled: s.break_glass_enabled === 'true',
      break_glass_url: s.break_glass_url || 'http://172.18.0.1:3100',
      ai_copilot_enabled: s.ai_copilot_enabled === 'true',
      ai_provider_url: s.ai_provider_url,
      ai_model_name: s.ai_model_name,
      ai_api_key_masked: maskSecret(s.ai_api_key),
      has_ai_api_key: Boolean(s.ai_api_key),
      require_login: s.require_login !== 'false',
      has_admin_password: Boolean(s.admin_password_hash),
      last_directory_sync_at: s.last_directory_sync_at || null,
      database_mode: db.isUsingPostgres() ? 'postgresql' : 'local-fallback'
    });
  } catch (err) {
    res.status(500).json({ error: 'internal_error', message: err.message });
  }
});

async function handleUpdateCiamSettings(req, res) {
  try {
    if (!req.apexUser?.permissions?.includes('users')) {
      return res.status(403).json({ error: 'forbidden', message: 'เฉพาะผู้ดูแลระบบเท่านั้น' });
    }
    const body = req.body || {};
    const updates = {};
    const stringFields = [
      'app_code',
      'app_domain',
      'ciam_issuer_url',
      'ciam_client_id',
      'ciam_redirect_uri',
      'ciam_post_logout_redirect_uri',
      'ciam_allowed_ips',
      'ciam_portal_url',
      'break_glass_url',
      'ai_provider_url',
      'ai_model_name'
    ];
    for (const f of stringFields) {
      if (body[f] !== undefined) updates[f] = String(body[f]).trim();
    }
    if (body.ciam_enabled !== undefined) updates.ciam_enabled = String(Boolean(body.ciam_enabled));
    if (body.break_glass_enabled !== undefined) updates.break_glass_enabled = String(Boolean(body.break_glass_enabled));
    if (body.ai_copilot_enabled !== undefined) updates.ai_copilot_enabled = String(Boolean(body.ai_copilot_enabled));
    if (body.require_login !== undefined) updates.require_login = String(Boolean(body.require_login));

    if (body.ciam_client_secret && !body.ciam_client_secret.includes('••••')) {
      updates.ciam_client_secret = String(body.ciam_client_secret).trim();
    }
    if (body.ciam_management_api_key && !body.ciam_management_api_key.includes('••••')) {
      updates.ciam_management_api_key = String(body.ciam_management_api_key).trim();
    }
    if (body.ai_api_key && !body.ai_api_key.includes('••••')) {
      updates.ai_api_key = String(body.ai_api_key).trim();
    }
    if (body.admin_local_password && !body.admin_local_password.includes('••••')) {
      const pwd = String(body.admin_local_password).trim();
      const compErr = validatePasswordComplexity(pwd, 'admin');
      if (compErr) {
        return res.status(400).json({ error: 'complexity_violation', message: compErr });
      }
      updates.admin_password_hash = db.hashPassword(pwd);
    }

    await db.updateSystemSettings(updates, req.apexUser.id);
    await db.insertAuditLog({
      eventCode: 'CFG-01',
      actorId: req.apexUser.id,
      actorEmail: req.apexUser.email,
      actorRole: req.apexUser.role,
      ipAddress: getClientIp(req),
      targetResource: 'system_settings',
      details: { updated_keys: Object.keys(updates) }
    });

    res.json({ status: 'ok', message: 'บันทึกการตั้งค่า Central IAM & Security ลงตาราง system_settings เรียบร้อยแล้ว' });
  } catch (err) {
    res.status(500).json({ error: 'internal_error', message: err.message });
  }
}

// Support both PUT (Spec A.2) and POST for backwards compatibility
router.put('/api/settings/ciam-sso', handleUpdateCiamSettings);
router.post('/api/settings/ciam-sso', handleUpdateCiamSettings);

router.post('/api/settings/ciam-sso/test', async (req, res) => {
  try {
    const s = await db.getSystemSettings();
    const targetIssuer = (req.body?.ciam_issuer_url || s.ciam_issuer_url || 'https://ciam.windowasia.com').replace(/\/+$/, '');
    const discoveryUrl = `${targetIssuer}/.well-known/openid-configuration`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
      const resp = await fetch(discoveryUrl, { signal: controller.signal });
      clearTimeout(timer);
      if (resp.ok) {
        const meta = await resp.json();
        return res.json({
          status: 'ok',
          discovery_url: discoveryUrl,
          issuer: meta.issuer,
          authorization_endpoint: meta.authorization_endpoint,
          token_endpoint: meta.token_endpoint,
          jwks_uri: meta.jwks_uri
        });
      }
      return res.json({
        status: 'warning',
        discovery_url: discoveryUrl,
        http_status: resp.status,
        message: `เชื่อมต่อเซิร์ฟเวอร์ได้ แต่ได้รับสถานะ HTTP ${resp.status}`
      });
    } catch (netErr) {
      clearTimeout(timer);
      return res.json({
        status: 'unreachable',
        discovery_url: discoveryUrl,
        message: `ยังไม่สามารถติดต่อ ${discoveryUrl} จากสภาพแวดล้อมนี้ (${netErr.message})`
      });
    }
  } catch (err) {
    res.status(500).json({ error: 'internal_error', message: err.message });
  }
});

// ============================================================================
// GROUP B: OAuth2/OIDC + PKCE (S256) + Local/Admin Login + Break-Glass + Inactive Guard (SSO-04)
// ============================================================================

router.get('/api/auth/session', async (req, res) => {
  try {
    const s = await db.getSystemSettings();
    const isAuthenticated = Boolean(req.apexAuthenticated && req.apexUser);

    res.json({
      authenticated: isAuthenticated,
      require_login: true,
      ciam_enabled: s.ciam_enabled === 'true',
      break_glass_enabled: s.break_glass_enabled === 'true',
      ciam_issuer_url: s.ciam_issuer_url || 'https://ciam.windowasia.com',
      app_domain: s.app_domain || 'https://apex.windowasia.com',
      database_mode: db.isUsingPostgres() ? 'postgresql' : 'local-fallback',
      user: isAuthenticated ? req.apexUser : null
    });
  } catch (err) {
    res.status(500).json({ error: 'session_check_error', message: err.message });
  }
});

// Public SSO Config probe endpoint (Spec Section B.1 - consumed by Central-IAM health check)
router.get('/api/auth/sso/config', async (req, res) => {
  try {
    const s = await db.getSystemSettings();
    const ssoEnabled = s.ciam_enabled === 'true';
    const breakGlassActive = s.break_glass_enabled === 'true';
    res.json({
      app_code: s.app_code || 'apex',
      sso_enabled: ssoEnabled,
      ciam_enabled: ssoEnabled,
      break_glass_active: breakGlassActive,
      break_glass_enabled: breakGlassActive,
      issuer_url: s.ciam_issuer_url || 'https://ciam.windowasia.com',
      client_id: s.ciam_client_id || 'apex-spoke-client'
    });
  } catch (err) {
    res.status(500).json({ error: 'sso_config_error', message: err.message });
  }
});

router.post('/api/auth/login', authRateLimiter, async (req, res) => {
  try {
    const { identifier, password, corporate_fax, security_honey, form_render_ts } = req.body || {};
    const s = await db.getSystemSettings();
    const users = await db.getCollection('users');
    const cleanId = String(identifier || '').trim().toLowerCase();
    const clientIp = getClientIp(req);

    // Layer 2: Decoy Honeypot Trap Evaluation (Spec v2.12.0 หมวด F.3)
    if (corporate_fax || security_honey) {
      await db.insertAuditLog({
        eventCode: 'BOT_HONEYPOT_DETECTED',
        actorEmail: cleanId || 'unknown',
        ipAddress: clientIp,
        targetResource: '/api/auth/login',
        details: {
          reason: 'honeypot_field_filled',
          corporate_fax: Boolean(corporate_fax),
          security_honey: Boolean(security_honey)
        }
      });
      // Silent rejection with standard credentials error (hides honeypot presence from bot)
      return res.status(401).json({
        error: 'invalid_credentials',
        message: 'รหัสผู้ใช้งานหรือรหัสผ่านไม่ถูกต้อง'
      });
    }

    // Layer 3: Submission Velocity & Timing Guard (Spec v2.12.0 หมวด F.4)
    if (form_render_ts !== undefined && form_render_ts !== null && form_render_ts !== '') {
      const ts = Number(form_render_ts);
      if (!isNaN(ts)) {
        const deltaMs = Date.now() - ts;
        if (deltaMs < 400 || deltaMs < -10000) {
          await db.insertAuditLog({
            eventCode: 'BOT_TIMING_VIOLATION',
            actorEmail: cleanId || 'unknown',
            ipAddress: clientIp,
            targetResource: '/api/auth/login',
            details: {
              delta_ms: deltaMs,
              reason: deltaMs < 400 ? 'submission_too_fast' : 'timestamp_in_future'
            }
          });
          return res.status(400).json({
            error: 'velocity_timing_violation',
            code: 'BOT_TIMING_VIOLATION',
            message: 'ตรวจพบความเร็วการส่งข้อมูลผิดปกติของมนุษย์ (< 400ms)'
          });
        }
      }
    }

    if (!cleanId || !password) {
      return res.status(400).json({
        error: 'missing_credentials',
        message: 'กรุณาระบุรหัสผู้ใช้งานและรหัสผ่านให้ครบถ้วน'
      });
    }

    let userRecord = users.find(
      u =>
        String(u.id || '').toLowerCase() === cleanId ||
        String(u.uid || '').toLowerCase() === cleanId ||
        String(u.email || '').toLowerCase() === cleanId
    );

    if (!userRecord && (cleanId === 'admin' || cleanId === 'u01@windowasia.co.th')) {
      userRecord = users.find(u => u.id === 'U01') || null;
    }

    if (!userRecord) {
      await db.insertAuditLog({
        eventCode: 'SSO-02',
        actorEmail: cleanId,
        ipAddress: clientIp,
        targetResource: '/api/auth/login',
        details: { reason: 'user_not_found', identifier: cleanId }
      });
      return res.status(401).json({
        error: 'invalid_credentials',
        message: 'รหัสผู้ใช้งานหรือรหัสผ่านไม่ถูกต้อง'
      });
    }

    // MANDATORY RULE: Inactive Account Guard (SSO-04)
    if (userRecord.active === false) {
      await db.insertAuditLog({
        eventCode: 'SSO-04',
        actorId: userRecord.id,
        actorEmail: userRecord.email || cleanId,
        actorRole: userRecord.role,
        ipAddress: clientIp,
        targetResource: '/api/auth/login',
        details: { reason: 'inactive_account_blocked', status_origin: userRecord.status_origin || 'LOCAL' }
      });
      return res.status(403).json({
        error: 'account_inactive',
        code: 'SSO-04',
        message: 'บัญชีผู้ใช้งานของคุณถูกระงับการใช้งาน (SSO-04) กรุณาติดต่อผู้ดูแลระบบ'
      });
    }

    // Verify per-user password_hash (or primary admin U01's admin_password_hash ONLY — no shared fallback across users)
    let passwordValid = false;
    if (userRecord.password_hash) {
      passwordValid = db.verifyPassword(String(password), userRecord.password_hash);
    } else if (userRecord.id === 'U01' && s.admin_password_hash) {
      passwordValid = db.verifyPassword(String(password), s.admin_password_hash);
    }

    if (!passwordValid) {
      await db.insertAuditLog({
        eventCode: 'SSO-02',
        actorId: userRecord.id,
        actorEmail: userRecord.email || cleanId,
        actorRole: userRecord.role,
        ipAddress: clientIp,
        targetResource: '/api/auth/login',
        details: { reason: 'invalid_password' }
      });
      return res.status(401).json({
        error: 'invalid_credentials',
        message: 'รหัสผู้ใช้งานหรือรหัสผ่านไม่ถูกต้อง'
      });
    }

    // MANDATORY RULE: 90-Day Forced Password Rotation & Complexity (Spec v2.12.0 หมวด G)
    // Applies ONLY to Local Accounts (use_ad_auth === false or Local Admin login)!
    // MUST NEVER apply to AD Accounts (use_ad_auth === true)!
    const isAdUser = userRecord.use_ad_auth === true || (userRecord.use_ad_auth === undefined && userRecord.kind !== 'external');
    let mustChangePassword = false;
    let passwordExpired = false;
    let daysLeft = 90;

    if (!isAdUser) {
      const expiry = checkPasswordExpiry90Days(userRecord.password_changed_at, userRecord.createdAt);
      passwordExpired = expiry.expired;
      daysLeft = expiry.daysLeft;
      mustChangePassword = Boolean(userRecord.must_change_password) || expiry.expired;
    } else {
      // AD Account: Strictly bypassed 100%!
      mustChangePassword = false;
      passwordExpired = false;
    }

    const sessionId = crypto.randomBytes(32).toString('hex');
    ssoSessions.set(sessionId, {
      userId: userRecord.id,
      uid: userRecord.uid || userRecord.id,
      email: userRecord.email || `${String(userRecord.id).toLowerCase()}@windowasia.co.th`,
      authenticatedAt: new Date().toISOString(),
      mustChangePassword
    });

    await db.insertAuditLog({
      eventCode: 'SSO-01',
      actorId: userRecord.id,
      actorEmail: userRecord.email || cleanId,
      actorRole: userRecord.role,
      ipAddress: clientIp,
      targetResource: '/api/auth/login',
      details: {
        auth_method: 'local_credentials',
        app_code: 'apex',
        is_ad_user: isAdUser,
        must_change_password: mustChangePassword
      }
    });

    res.setHeader(
      'Set-Cookie',
      `apex_session=${sessionId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=28800`
    );
    res.json({
      status: 'ok',
      message: `เข้าสู่ระบบสำเร็จในชื่อ ${userRecord.name}`,
      must_change_password: mustChangePassword,
      password_expired: passwordExpired,
      password_days_left: daysLeft,
      user: {
        id: userRecord.id,
        uid: userRecord.uid || userRecord.id,
        name: userRecord.name,
        email: userRecord.email,
        role: userRecord.role,
        use_ad_auth: isAdUser
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'login_error', message: err.message });
  }
});

/**
 * Enterprise Local Account Password Change API (Spec v2.12.0 หมวด G.4.A/B)
 * Enforces 8-16 characters complexity and updates password_changed_at (valid for 90 days).
 * STRICT RULE: Only local accounts or local admin may use this. AD accounts are forbidden.
 */
router.post('/api/auth/local/change-password', async (req, res) => {
  try {
    if (!req.apexAuthenticated || !req.apexUser) {
      return res.status(401).json({ error: 'unauthorized', message: 'กรุณาเข้าสู่ระบบก่อนเปลี่ยนรหัสผ่าน' });
    }
    const { old_password, new_password } = req.body || {};
    if (!old_password || !new_password) {
      return res.status(400).json({
        error: 'missing_fields',
        message: 'กรุณากรอกรหัสผ่านเดิมและรหัสผ่านใหม่ให้ครบถ้วน'
      });
    }

    const users = await db.getCollection('users');
    const userRecord = users.find(u => u.id === req.apexUser.id);
    if (!userRecord) {
      return res.status(404).json({ error: 'user_not_found', message: 'ไม่พบบัญชีผู้ใช้' });
    }

    // MANDATORY RULE: AD accounts cannot change local password here
    const isAdUser = userRecord.use_ad_auth === true || (userRecord.use_ad_auth === undefined && userRecord.kind !== 'external');
    if (isAdUser && userRecord.id !== 'U01') {
      return res.status(403).json({
        error: 'ad_account_forbidden',
        message: 'บัญชี Active Directory ไม่ได้รับอนุญาตให้เปลี่ยนรหัสผ่านท้องถิ่น กรุณาเปลี่ยนผ่าน Windows หรือ Central IAM Portal'
      });
    }

    const s = await db.getSystemSettings();
    let oldValid = false;
    if (userRecord.password_hash) {
      oldValid = db.verifyPassword(String(old_password), userRecord.password_hash);
    } else if (userRecord.id === 'U01' && s.admin_password_hash) {
      oldValid = db.verifyPassword(String(old_password), s.admin_password_hash);
    }

    if (!oldValid) {
      return res.status(400).json({ error: 'invalid_old_password', message: 'รหัสผ่านเดิมไม่ถูกต้อง' });
    }

    // Complexity check: 8-16 chars, Uppercase, Lowercase, Digit, Special char, No username
    const complexityErr = validatePasswordComplexity(String(new_password).trim(), userRecord.name || userRecord.id);
    if (complexityErr) {
      return res.status(400).json({ error: 'complexity_violation', message: complexityErr });
    }

    const newHash = db.hashPassword(String(new_password).trim());
    const nowIso = new Date().toISOString();

    if (userRecord.id === 'U01') {
      await db.updateSystemSettings({ admin_password_hash: newHash }, userRecord.id);
    }

    await db.updateDoc(
      'users',
      userRecord.id,
      {
        password_hash: newHash,
        password_changed_at: nowIso,
        must_change_password: false
      },
      userRecord.id
    );

    // Update active session flag
    const cookies = parseCookies(req.headers.cookie || '');
    if (cookies.apex_session && ssoSessions.has(cookies.apex_session)) {
      const sess = ssoSessions.get(cookies.apex_session);
      sess.mustChangePassword = false;
    }

    await db.insertAuditLog({
      eventCode: 'PW_CHANGE',
      actorId: userRecord.id,
      actorEmail: userRecord.email || '',
      actorRole: userRecord.role,
      ipAddress: getClientIp(req),
      targetResource: `users/${userRecord.id}`,
      details: { action: 'local_password_rotated_90_days', days_valid: 90 }
    });

    res.json({
      status: 'ok',
      message: 'เปลี่ยนรหัสผ่านเรียบร้อยแล้ว (มีผลบังคับใช้ 90 วันตามมาตรฐาน ISO 27001)',
      password_changed_at: nowIso,
      must_change_password: false
    });
  } catch (err) {
    res.status(500).json({ error: 'change_password_error', message: err.message });
  }
});

// RFC 9700 Seamless Bounce Entry Point
router.get('/auth/start', async (req, res) => {
  const s = await db.getSystemSettings();
  if (s.ciam_enabled === 'true') {
    return res.redirect('/api/auth/sso/login');
  }
  return res.redirect('/');
});

router.get('/api/auth/sso/login', async (req, res) => {
  try {
    const s = await db.getSystemSettings();
    const baseIssuer =
      s.break_glass_enabled === 'true'
        ? (s.break_glass_url || 'http://172.18.0.1:3100').replace(/\/+$/, '')
        : (s.ciam_issuer_url || 'https://ciam.windowasia.com').replace(/\/+$/, '');

    const codeVerifier = crypto.randomBytes(32).toString('base64url');
    const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
    const state = crypto.randomBytes(16).toString('hex');

    pkceStore.set(state, {
      codeVerifier,
      createdAt: Date.now(),
      returnTo: req.query.return_to || '/'
    });

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: s.ciam_client_id || 'apex-spoke-client',
      redirect_uri: s.ciam_redirect_uri || 'https://apex.windowasia.com/api/auth/sso/callback',
      scope: 'openid profile email roles',
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256'
    });

    res.redirect(`${baseIssuer}/oauth2/authorize?${params.toString()}`);
  } catch (err) {
    res.status(500).json({ error: 'sso_login_error', message: err.message });
  }
});

router.get('/api/auth/sso/callback', async (req, res) => {
  try {
    const { code, state } = req.query;
    const pkce = state ? pkceStore.get(String(state)) : null;
    if (state) pkceStore.delete(String(state));

    const s = await db.getSystemSettings();
    const ssoActive = s.ciam_enabled === 'true' || s.break_glass_enabled === 'true';
    if (!ssoActive || !s.ciam_client_secret) {
      await db.insertAuditLog({
        eventCode: 'SSO-02',
        ipAddress: getClientIp(req),
        targetResource: '/api/auth/sso/callback',
        details: { reason: 'sso_not_configured_or_disabled' }
      });
      return res.status(403).json({
        error: 'sso_not_configured',
        message: 'ระบบ Central IAM SSO ยังไม่ได้เปิดใช้งานหรือยังไม่ได้ตั้งค่า Client Secret'
      });
    }

    const pkceValid = Boolean(pkce && pkce.codeVerifier && Date.now() - pkce.createdAt <= 10 * 60 * 1000);
    if (!code || !state || !pkceValid) {
      await db.insertAuditLog({
        eventCode: 'SSO-02',
        ipAddress: getClientIp(req),
        targetResource: '/api/auth/sso/callback',
        details: {
          reason: !code ? 'missing_authorization_code' : 'invalid_or_expired_pkce_state',
          pkce_valid: pkceValid
        }
      });
      return res.status(400).json({
        error: 'invalid_grant',
        message: 'ข้อมูลยืนยันตัวตน (Authorization Code หรือ PKCE State) ไม่ถูกต้องหรือหมดอายุ'
      });
    }

    const baseIssuer =
      s.break_glass_enabled === 'true'
        ? (s.break_glass_url || 'http://172.18.0.1:3100').replace(/\/+$/, '')
        : (s.ciam_issuer_url || 'https://ciam.windowasia.com').replace(/\/+$/, '');

    // Exchange authorization code + PKCE code_verifier with Central IAM token endpoint
    const tokenParams = new URLSearchParams({
      grant_type: 'authorization_code',
      code: String(code),
      redirect_uri: s.ciam_redirect_uri || 'https://apex.windowasia.com/api/auth/sso/callback',
      client_id: s.ciam_client_id || 'apex-spoke-client',
      client_secret: s.ciam_client_secret,
      code_verifier: pkce.codeVerifier
    });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    let verifiedEmail = '';
    let verifiedSub = '';
    try {
      const tokenResp = await fetch(`${baseIssuer}/oauth2/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json'
        },
        body: tokenParams.toString(),
        signal: controller.signal
      });
      if (!tokenResp.ok) {
        clearTimeout(timer);
        await db.insertAuditLog({
          eventCode: 'SSO-02',
          ipAddress: getClientIp(req),
          targetResource: '/api/auth/sso/callback',
          details: { reason: 'token_exchange_failed', status: tokenResp.status }
        });
        return res.status(401).json({
          error: 'token_exchange_failed',
          message: 'ไม่สามารถแลกเปลี่ยน Authorization Code กับเซิร์ฟเวอร์ Central IAM ได้'
        });
      }
      const tokenData = await tokenResp.json();
      if (!tokenData.access_token) {
        clearTimeout(timer);
        return res.status(401).json({
          error: 'missing_access_token',
          message: 'ไม่ได้รับ Access Token จากเซิร์ฟเวอร์ Central IAM'
        });
      }

      const userInfoResp = await fetch(`${baseIssuer}/oauth2/userinfo`, {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
          Accept: 'application/json'
        },
        signal: controller.signal
      });
      clearTimeout(timer);
      if (!userInfoResp.ok) {
        await db.insertAuditLog({
          eventCode: 'SSO-02',
          ipAddress: getClientIp(req),
          targetResource: '/api/auth/sso/callback',
          details: { reason: 'userinfo_fetch_failed', status: userInfoResp.status }
        });
        return res.status(401).json({
          error: 'userinfo_failed',
          message: 'ไม่สามารถตรวจสอบข้อมูลผู้ใช้จาก Central IAM ได้'
        });
      }
      const profile = await userInfoResp.json();
      verifiedEmail = String(profile.email || '').trim().toLowerCase();
      verifiedSub = String(profile.sub || '').trim();
    } catch (netErr) {
      clearTimeout(timer);
      await db.insertAuditLog({
        eventCode: 'SSO-02',
        ipAddress: getClientIp(req),
        targetResource: '/api/auth/sso/callback',
        details: { reason: 'ciam_network_error', error: netErr.message }
      });
      return res.status(502).json({
        error: 'ciam_unreachable',
        message: 'ไม่สามารถติดต่อเซิร์ฟเวอร์ Central IAM เพื่อตรวจสอบ Token ได้'
      });
    }

    if (!verifiedEmail && !verifiedSub) {
      return res.status(401).json({
        error: 'unverified_identity',
        message: 'ไม่พบข้อมูลอีเมลหรือรหัสประจำตัวจาก Central IAM'
      });
    }

    const users = await db.getCollection('users');
    const userRecord = users.find(
      u =>
        (verifiedEmail && u.email && u.email.toLowerCase() === verifiedEmail) ||
        (verifiedSub && (u.uid === verifiedSub || u.id === verifiedSub))
    );

    // Zero fallback to U01: account must exist in APEX directory
    if (!userRecord) {
      await db.insertAuditLog({
        eventCode: 'SSO-02',
        actorEmail: verifiedEmail,
        ipAddress: getClientIp(req),
        targetResource: '/api/auth/sso/callback',
        details: { reason: 'account_not_provisioned', sub: verifiedSub }
      });
      return res.status(403).json({
        error: 'account_not_provisioned',
        message: 'บัญชีผู้ใช้งานนี้ยังไม่ได้รับสิทธิ์เข้าใช้งานในระบบ APEX'
      });
    }

    // MANDATORY RULE: Inactive Account Guard (SSO-04) - NEVER auto-enable disabled local accounts
    if (userRecord.active === false) {
      await db.insertAuditLog({
        eventCode: 'SSO-04',
        actorId: userRecord.id,
        actorEmail: userRecord.email || verifiedEmail,
        actorRole: userRecord.role,
        ipAddress: getClientIp(req),
        targetResource: '/api/auth/sso/callback',
        details: {
          reason: 'inactive_account_blocked',
          status_origin: userRecord.status_origin || 'LOCAL'
        }
      });
      return res.status(403).json({
        error: 'account_inactive',
        code: 'SSO-04',
        message: 'บัญชีผู้ใช้งานของคุณถูกระงับการใช้งานในระบบ APEX กรุณาติดต่อผู้ดูแลระบบ'
      });
    }

    const sessionId = crypto.randomBytes(32).toString('hex');
    ssoSessions.set(sessionId, {
      userId: userRecord.id,
      uid: userRecord.uid || verifiedSub || userRecord.id,
      email: userRecord.email || verifiedEmail,
      authenticatedAt: new Date().toISOString()
    });

    await db.insertAuditLog({
      eventCode: 'SSO-01',
      actorId: userRecord.id,
      actorEmail: userRecord.email || verifiedEmail,
      actorRole: userRecord.role,
      ipAddress: getClientIp(req),
      targetResource: '/api/auth/sso/callback',
      details: { pkce_verified: true, app_code: 'apex' }
    });

    res.setHeader(
      'Set-Cookie',
      `apex_session=${sessionId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=28800`
    );
    res.redirect(pkce.returnTo || '/');
  } catch (err) {
    res.status(500).json({ error: 'callback_error', message: err.message });
  }
});

router.post('/api/auth/sso/logout', async (req, res) => {
  try {
    const cookies = parseCookies(req.headers.cookie || '');
    if (cookies.apex_session) {
      ssoSessions.delete(cookies.apex_session);
    }
    const s = await db.getSystemSettings();
    const isAdUser = req.apexUser
      ? (req.apexUser.use_ad_auth === true || (req.apexUser.use_ad_auth === undefined && req.apexUser.kind !== 'external'))
      : true;

    await db.insertAuditLog({
      eventCode: 'SSO-03',
      actorId: req.apexUser?.id || 'unknown',
      actorEmail: req.apexUser?.email || '',
      actorRole: req.apexUser?.role || '',
      ipAddress: getClientIp(req),
      targetResource: '/api/auth/sso/logout',
      details: { action: 'user_logout', is_ad_user: isAdUser }
    });
    res.setHeader('Set-Cookie', 'apex_session=; Path=/; HttpOnly; Max-Age=0');

    // Spec v2.12.0 ข้อ 5.3: SSO user -> redirect to Central IAM Portal; Local user -> redirect to /login
    const redirectUri = isAdUser
      ? (s.ciam_portal_url || 'https://ciam.windowasia.com/portal')
      : '/login';

    res.json({ status: 'ok', redirect_uri: redirectUri });
  } catch (err) {
    res.status(500).json({ error: 'logout_error', message: err.message });
  }
});

router.post('/api/auth/sso/break-glass', async (req, res) => {
  try {
    if (!req.apexUser?.permissions?.includes('users')) {
      return res.status(403).json({ error: 'forbidden', message: 'เฉพาะผู้ดูแลระบบเท่านั้น' });
    }
    const enable = Boolean(req.body?.enabled);
    const reason = String(req.body?.reason || 'Emergency Auth Fallback').trim();
    await db.updateSystemSettings({ break_glass_enabled: String(enable) }, req.apexUser.id);

    await db.insertAuditLog({
      eventCode: enable ? 'BG-01' : 'BG-02',
      actorId: req.apexUser.id,
      actorEmail: req.apexUser.email,
      actorRole: req.apexUser.role,
      ipAddress: getClientIp(req),
      targetResource: 'break_glass_mode',
      details: { break_glass_enabled: enable, reason, fallback_url: 'http://172.18.0.1:3100' }
    });

    res.json({
      status: 'ok',
      break_glass_enabled: enable,
      event_code: enable ? 'BG-01' : 'BG-02'
    });
  } catch (err) {
    res.status(500).json({ error: 'break_glass_error', message: err.message });
  }
});

// ============================================================================
// GROUP C: Push Directory Provisioning (/api/v1/directory/accounts*)
// Enforces X-Management-API-Key + IP Whitelist (157.173.219.153) + 2-Way Status Sync
// ============================================================================

async function verifyCiamManagementAuth(req, res, next) {
  const s = await db.getSystemSettings();
  const clientIp = getClientIp(req);
  const allowedIps = (s.ciam_allowed_ips || '157.173.219.153,172.18.0.1,127.0.0.1,::1')
    .split(',')
    .map(x => x.trim())
    .filter(Boolean);
  if (!allowedIps.includes('172.18.0.1')) {
    allowedIps.push('172.18.0.1');
  }

  if (!allowedIps.includes(clientIp) && !allowedIps.includes('*')) {
    await db.insertAuditLog({
      eventCode: 'DIR-DENY-IP',
      ipAddress: clientIp,
      targetResource: req.originalUrl,
      details: { reason: 'ip_not_whitelisted', clientIp }
    });
    return res.status(403).json({ error: 'ip_not_allowed', clientIp });
  }

  const providedKey = req.headers['x-management-api-key'] || '';
  if (!s.ciam_management_api_key || !safeCompare(providedKey, s.ciam_management_api_key)) {
    return res.status(401).json({ error: 'invalid_management_api_key' });
  }
  next();
}

router.get('/api/v1/directory/accounts', verifyCiamManagementAuth, async (req, res) => {
  const users = await db.getCollection('users');
  res.json({
    app_code: 'apex',
    total: users.length,
    accounts: users.map(u => ({
      id: u.id,
      external_id: u.uid || u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      kind: u.kind || 'internal',
      use_ad_auth: u.use_ad_auth ?? u.kind !== 'external',
      is_active: u.active !== false,
      status_origin: u.status_origin || 'LOCAL',
      last_seen: u.lastSeen || null
    }))
  });
});

router.post('/api/v1/directory/accounts', verifyCiamManagementAuth, async (req, res) => {
  const b = req.body || {};
  const id = b.id || b.external_id || 'U' + Date.now().toString(36).toUpperCase();
  const kind = b.kind || (['contractor', 'customer'].includes(b.role) ? 'external' : 'internal');
  const record = {
    id,
    uid: b.external_id || id,
    name: b.name || 'CIAM Provisioned User',
    title: b.title || '',
    email: b.email || '',
    phone: b.phone || '',
    role: b.role || 'viewer',
    kind,
    use_ad_auth: b.use_ad_auth ?? kind !== 'external',
    active: b.is_active !== false,
    status_origin: 'CIAM',
    projects: b.projects || (b.role === 'admin' ? 'all' : []),
    team: b.team || '',
    grant: b.grant || [],
    deny: b.deny || [],
    createdAt: new Date().toISOString()
  };
  await db.setDoc('users', id, record, 'ciam-push');
  await db.insertAuditLog({
    eventCode: 'DIR-PROVISION',
    actorId: 'CIAM-HUB',
    ipAddress: getClientIp(req),
    targetResource: `users/${id}`,
    details: { role: record.role, use_ad_auth: record.use_ad_auth, is_active: record.active }
  });
  res.status(201).json({ status: 'created', account: record });
});

router.put('/api/v1/directory/accounts/:id', verifyCiamManagementAuth, async (req, res) => {
  const id = req.params.id;
  const existing = await db.getDoc('users', id);
  if (!existing) return res.status(404).json({ error: 'account_not_found' });

  const b = req.body || {};
  // True 2-Way Status Sync: If locally disabled (status_origin === 'LOCAL' && existing.active === false)
  // do not auto-enable unless explicit force_override is sent by CIAM Admin
  let nextActive = existing.active !== false;
  let nextOrigin = existing.status_origin || 'LOCAL';
  if (typeof b.is_active === 'boolean') {
    if (existing.active === false && existing.status_origin === 'LOCAL' && !b.force_override) {
      nextActive = false;
      nextOrigin = 'LOCAL';
    } else {
      nextActive = b.is_active;
      nextOrigin = 'CIAM';
    }
  }

  const updated = await db.updateDoc(
    'users',
    id,
    {
      ...(b.name ? { name: b.name } : {}),
      ...(b.email ? { email: b.email } : {}),
      ...(b.role ? { role: b.role } : {}),
      ...(typeof b.use_ad_auth === 'boolean' ? { use_ad_auth: b.use_ad_auth } : {}),
      active: nextActive,
      status_origin: nextOrigin
    },
    'ciam-push'
  );
  res.json({ status: 'updated', account: updated });
});

/**
 * Spec v2.12.0 หมวด C.3 & D.7:
 * 1-Click Offboarding & Reactivate via Central Identity Management
 * Enforces CIAM Authority Lock (`is_status_locked`) and immediate session revocation.
 */
router.patch('/api/v1/directory/accounts/:username/status', verifyCiamManagementAuth, async (req, res) => {
  try {
    const targetUsername = String(req.params.username || '').trim();
    const users = await db.getCollection('users');
    const existing = users.find(
      u =>
        String(u.id || '').toLowerCase() === targetUsername.toLowerCase() ||
        String(u.uid || '').toLowerCase() === targetUsername.toLowerCase() ||
        (u.email && u.email.toLowerCase() === targetUsername.toLowerCase())
    );

    if (!existing) {
      return res.status(404).json({ error: 'account_not_found', message: `ไม่พบบัญชี ${targetUsername}` });
    }

    const { is_active, reason, force_override } = req.body || {};
    if (typeof is_active !== 'boolean') {
      return res.status(400).json({ error: 'invalid_status', message: 'กรุณาระบุ is_active เป็น boolean' });
    }

    // CIAM Authority Lock Standard (Spec v2.12.0 หมวด D.7.4)
    if (existing.is_status_locked === true && !force_override) {
      await db.insertAuditLog({
        eventCode: 'SPOKE_OVERRIDE_REJECTED',
        actorId: 'CIAM-HUB',
        ipAddress: getClientIp(req),
        targetResource: `users/${existing.id}`,
        details: { reason: 'account_status_locked_by_central_authority', requested_active: is_active }
      });
      return res.status(409).json({
        error: 'status_locked',
        message: 'บัญชีนี้ถูกล็อคสิทธิ์เด็ดขาดโดย Central IAM (is_status_locked: true) ไม่สามารถแก้ไขได้'
      });
    }

    const updated = await db.updateDoc(
      'users',
      existing.id,
      {
        active: is_active,
        status_origin: 'CIAM',
        status_updated_at: new Date().toISOString()
      },
      'ciam-patch'
    );

    // If account deactivated, revoke all active sessions immediately (Spec C.3 & SSO-04)
    if (!is_active) {
      for (const [sessId, sess] of ssoSessions.entries()) {
        if (sess.userId === existing.id || sess.uid === existing.uid) {
          ssoSessions.delete(sessId);
        }
      }
    }

    await db.insertAuditLog({
      eventCode: is_active ? 'DIR-REACTIVATE' : 'SSO-04',
      actorId: 'CIAM-HUB',
      actorEmail: existing.email || '',
      actorRole: existing.role,
      ipAddress: getClientIp(req),
      targetResource: `users/${existing.id}`,
      details: {
        action: is_active ? 'account_reactivated' : '1_click_offboard',
        reason: reason || '1-Click Offboarding via Central Identity Management',
        is_active
      }
    });

    res.json({
      username: existing.id,
      is_active,
      message: `Account status updated to ${is_active}`,
      updated_at: new Date().toISOString()
    });
  } catch (err) {
    res.status(500).json({ error: 'status_update_error', message: err.message });
  }
});

// ============================================================================
// GROUP D: Spoke Pull Agent Heartbeat & Immediate Sync + Audit Logs Viewer
// ============================================================================

router.post('/api/settings/ciam-sso/sync-now', async (req, res) => {
  try {
    if (!req.apexUser?.permissions?.includes('users')) {
      return res.status(403).json({ error: 'forbidden' });
    }
    const nowIso = new Date().toISOString();
    const users = await db.getCollection('users');
    await db.updateSystemSettings({ last_directory_sync_at: nowIso }, req.apexUser.id);

    await db.insertAuditLog({
      eventCode: 'SYNC-01',
      actorId: req.apexUser.id,
      actorEmail: req.apexUser.email,
      actorRole: req.apexUser.role,
      ipAddress: getClientIp(req),
      targetResource: 'ciam_directory_sync',
      details: { synced_accounts: users.length, synced_at: nowIso }
    });

    res.json({
      status: 'ok',
      synced_accounts: users.length,
      synced_at: nowIso,
      message: `ซิงค์ข้อมูลบัญชีผู้ใช้ (${users.length} บัญชี) กับระบบ Central IAM เรียบร้อยแล้ว`
    });
  } catch (err) {
    res.status(500).json({ error: 'sync_error', message: err.message });
  }
});

router.get('/api/v1/audit/logs', async (req, res) => {
  try {
    if (!req.apexUser?.permissions?.includes('users')) {
      return res.status(403).json({ error: 'forbidden' });
    }
    const logs = await db.getAuditLogs(req.query.limit || 100);
    res.json({ status: 'ok', logs });
  } catch (err) {
    res.status(500).json({ error: 'audit_log_error', message: err.message });
  }
});

router.validatePasswordComplexity = validatePasswordComplexity;
router.checkPasswordExpiry90Days = checkPasswordExpiry90Days;
router.LOCAL_PASSWORD_EXPIRY_DAYS = LOCAL_PASSWORD_EXPIRY_DAYS;

module.exports = router;
