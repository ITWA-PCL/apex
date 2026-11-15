/**
 * APEX (apex.windowasia.com) - Track A: Window Asia Central IAM (CIAM) v2.12.0 Spoke Integration
 * Implements Groups A-D, Audit Logging, In-App Bot Defense (หมวด F),
 * and Enterprise Local Password Policy & 90-Day Rotation (หมวด G).
 * Compliance: ISO 27001 / OIDC / PKCE S256 / RFC 9700
 */
const express = require('express');
const crypto = require('crypto');
const db = require('../db/postgres');
const notifier = require('./notifier');
const { ssoSessions, parseCookies, revokeUserSessions, ROLE_DEF } = require('./rbac');
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

const CIAM_ORIGIN_IP = '157.173.219.153';

function getClientIp(req) {
  return (
    (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
    req.headers['x-real-ip'] ||
    (req.socket?.remoteAddress || '').replace(/^::ffff:/, '') ||
    'unknown'
  );
}

function getCiamOriginIp(req, { verifiedCiamFlow = false, tokenPayload = null } = {}) {
  const headerOrigin =
    (req.headers['x-ciam-origin-ip'] || '').split(',')[0].trim() ||
    (req.headers['x-origin-ip'] || '').split(',')[0].trim();
  if (headerOrigin) return headerOrigin;
  if (tokenPayload?.ciam_origin_ip) return String(tokenPayload.ciam_origin_ip).trim();
  if (verifiedCiamFlow) return CIAM_ORIGIN_IP;
  return getClientIp(req);
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

function isHttpsRequest(req) {
  const proto = String(req?.headers?.['x-forwarded-proto'] || '').toLowerCase();
  return Boolean(req?.secure || proto.split(',')[0].trim() === 'https');
}

function buildSessionCookie(req, sessionId, maxAgeSeconds = 28800) {
  const secureFlag = isHttpsRequest(req) ? '; Secure' : '';
  return `apex_session=${sessionId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secureFlag}`;
}

function resolveRoleKeyFromCiam(roleInput, groupNameInput, fallbackRole = 'viewer') {
  const candidates = [roleInput, groupNameInput].filter(Boolean).map(v => String(v).trim());
  for (const raw of candidates) {
    const lower = raw.toLowerCase();
    if (ROLE_DEF[lower]) return lower;
    if (['super_admin', 'superadmin', 'system admin', 'administrator'].includes(lower)) return 'admin';
    for (const [k, def] of Object.entries(ROLE_DEF)) {
      if (String(def.l || '').toLowerCase() === lower) return k;
    }
  }
  return ROLE_DEF[fallbackRole] ? fallbackRole : 'viewer';
}

function findUserFlexible(users = [], identifier = '') {
  const key = String(identifier || '').trim().toLowerCase();
  if (!key) return null;
  return (
    users.find(u =>
      [u.id, u.uid, u.username, u.external_id, u.email]
        .filter(Boolean)
        .some(v => String(v).trim().toLowerCase() === key)
    ) || null
  );
}

function isExternalAccount(userRecord) {
  if (!userRecord) return false;
  return (
    userRecord.kind === 'external' ||
    ['contractor', 'customer'].includes(String(userRecord.role || '').toLowerCase())
  );
}

function isAdManagedAccount(userRecord) {
  if (!userRecord || userRecord.id === 'U01') return false;
  if (isExternalAccount(userRecord)) return false;
  return userRecord.use_ad_auth === true || userRecord.use_ad_auth === undefined;
}

function buildAuthUserProfile(userRecord, isAdUser) {
  return {
    id: userRecord.id,
    uid: userRecord.uid || userRecord.id,
    username: userRecord.username || userRecord.uid || userRecord.id,
    name: userRecord.name,
    email: userRecord.email || '',
    department: userRecord.department || userRecord.title || 'Operations',
    role: userRecord.role,
    kind: userRecord.kind || (isExternalAccount(userRecord) ? 'external' : 'internal'),
    use_ad_auth: Boolean(isAdUser),
    otp_enabled: Boolean(userRecord.otp_enabled)
  };
}

async function issueUserSession(
  req,
  res,
  userRecord,
  { authMethod = 'local_credentials', mustChangePassword = false, settings = null } = {}
) {
  const s = settings || (await db.getSystemSettings());
  const nowIso = new Date().toISOString();
  const ttlMinutes = Math.max(5, Number(s.ciam_session_ttl_minutes) || 480);
  const maxAgeSeconds = ttlMinutes * 60;
  const sessionId = crypto.randomBytes(32).toString('hex');
  const sessionPayload = {
    userId: userRecord.id,
    uid: userRecord.uid || userRecord.id,
    username: userRecord.username || userRecord.uid || userRecord.id,
    email: userRecord.email || `${String(userRecord.id).toLowerCase()}@windowasia.co.th`,
    authMethod,
    authenticatedAt: nowIso,
    expiresAt: Date.now() + maxAgeSeconds * 1000,
    mustChangePassword: Boolean(mustChangePassword)
  };
  ssoSessions.set(sessionId, sessionPayload);
  await db.saveSession(sessionId, sessionPayload);

  await db.updateDoc(
    'users',
    userRecord.id,
    { lastSeen: nowIso, last_login_at: nowIso },
    userRecord.id
  );

  res.setHeader('Set-Cookie', buildSessionCookie(req, sessionId, maxAgeSeconds));
  return { sessionId, sessionPayload, nowIso };
}

async function checkBotDefenseGuards(req, res, { targetResource = '/api/auth/login', checkTiming = true } = {}) {
  const { identifier, corporate_fax, security_honey, form_render_ts } = req.body || {};
  const cleanId = String(identifier || '').trim().toLowerCase();
  const clientIp = getClientIp(req);

  if (corporate_fax || security_honey) {
    await db.insertAuditLog({
      eventCode: 'BOT_HONEYPOT_DETECTED',
      actorEmail: cleanId || 'unknown',
      ipAddress: clientIp,
      targetResource,
      details: {
        reason: 'honeypot_field_filled',
        corporate_fax: Boolean(corporate_fax),
        security_honey: Boolean(security_honey)
      }
    });
    res.status(401).json({
      error: 'invalid_credentials',
      message: 'รหัสผู้ใช้งานหรือรหัสผ่านไม่ถูกต้อง'
    });
    return false;
  }

  if (checkTiming && form_render_ts !== undefined && form_render_ts !== null && form_render_ts !== '') {
    const ts = Number(form_render_ts);
    if (!isNaN(ts)) {
      const deltaMs = Date.now() - ts;
      if (deltaMs < 400 || deltaMs < -10000) {
        await db.insertAuditLog({
          eventCode: 'BOT_TIMING_VIOLATION',
          actorEmail: cleanId || 'unknown',
          ipAddress: clientIp,
          targetResource,
          details: {
            delta_ms: deltaMs,
            reason: deltaMs < 400 ? 'submission_too_fast' : 'timestamp_in_future'
          }
        });
        res.status(400).json({
          error: 'velocity_timing_violation',
          code: 'BOT_TIMING_VIOLATION',
          message: 'ตรวจพบความเร็วการส่งข้อมูลผิดปกติของมนุษย์ (< 400ms)'
        });
        return false;
      }
    }
  }

  return true;
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
      ciam_auto_provision_group: s.ciam_auto_provision_group || 'viewer',
      ciam_session_ttl_minutes: Number(s.ciam_session_ttl_minutes) || 480,
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
      telegram_enabled: s.telegram_enabled === 'true',
      telegram_bot_token_masked: maskSecret(s.telegram_bot_token),
      has_telegram_bot_token: Boolean(s.telegram_bot_token),
      telegram_chat_id: s.telegram_chat_id || '',
      telegram_notify_login: s.telegram_notify_login !== 'false',
      telegram_notify_user_provision: s.telegram_notify_user_provision !== 'false',
      telegram_notify_security_alert: s.telegram_notify_security_alert !== 'false',
      email_enabled: s.email_enabled === 'true',
      smtp_host: s.smtp_host || '',
      smtp_port: Number(s.smtp_port) || 587,
      smtp_user: s.smtp_user || '',
      smtp_password_masked: maskSecret(s.smtp_password),
      has_smtp_password: Boolean(s.smtp_password),
      smtp_from: s.smtp_from || 'APEX Security <noreply@windowasia.com>',
      email_webhook_url: s.email_webhook_url || '',
      login_otp_external: s.login_otp_external === 'true',
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
      'ciam_auto_provision_group',
      'break_glass_url',
      'ai_provider_url',
      'ai_model_name',
      'telegram_chat_id',
      'smtp_host',
      'smtp_port',
      'smtp_user',
      'smtp_from',
      'email_webhook_url'
    ];
    for (const f of stringFields) {
      if (body[f] !== undefined) updates[f] = String(body[f]).trim();
    }
    if (body.ciam_session_ttl_minutes !== undefined) {
      const ttl = parseInt(body.ciam_session_ttl_minutes, 10);
      if (Number.isFinite(ttl) && ttl >= 5 && ttl <= 10080) {
        updates.ciam_session_ttl_minutes = String(ttl);
      }
    }
    const boolFields = [
      'ciam_enabled',
      'break_glass_enabled',
      'ai_copilot_enabled',
      'require_login',
      'telegram_enabled',
      'telegram_notify_login',
      'telegram_notify_user_provision',
      'telegram_notify_security_alert',
      'email_enabled',
      'login_otp_external'
    ];
    for (const bf of boolFields) {
      if (body[bf] !== undefined) updates[bf] = String(Boolean(body[bf]));
    }

    if (body.ciam_client_secret && !String(body.ciam_client_secret).includes('••••')) {
      updates.ciam_client_secret = String(body.ciam_client_secret).trim();
    }
    if (body.ciam_management_api_key && !String(body.ciam_management_api_key).includes('••••')) {
      updates.ciam_management_api_key = String(body.ciam_management_api_key).trim();
    }
    if (body.ai_api_key && !String(body.ai_api_key).includes('••••')) {
      updates.ai_api_key = String(body.ai_api_key).trim();
    }
    if (body.telegram_bot_token && !String(body.telegram_bot_token).includes('••••')) {
      updates.telegram_bot_token = String(body.telegram_bot_token).trim();
    }
    if (body.smtp_password && !String(body.smtp_password).includes('••••')) {
      updates.smtp_password = String(body.smtp_password).trim();
    }
    if (body.admin_local_password && !String(body.admin_local_password).includes('••••')) {
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

    res.json({ status: 'ok', message: 'บันทึกการตั้งค่า Central IAM, Telegram & Security ลงตาราง system_settings เรียบร้อยแล้ว' });
  } catch (err) {
    res.status(500).json({ error: 'internal_error', message: err.message });
  }
}

// Support both PUT (Spec A.2) and POST for backwards compatibility
router.put('/api/settings/ciam-sso', handleUpdateCiamSettings);
router.post('/api/settings/ciam-sso', handleUpdateCiamSettings);

router.post('/api/settings/notifications/test-telegram', async (req, res) => {
  try {
    if (!req.apexUser?.permissions?.includes('users')) {
      return res.status(403).json({ error: 'forbidden', message: 'เฉพาะผู้ดูแลระบบเท่านั้น' });
    }
    const result = await notifier.sendTelegramNotification({
      text: `<b>[APEX Test] ทดสอบการเชื่อมต่อ Telegram Notification</b>\n• ผู้ทดสอบ: ${req.apexUser.name || req.apexUser.id}\n• เวลา: ${new Date().toLocaleString('th-TH')}`,
      chatId: req.body?.chat_id || '',
      eventType: 'manual_test',
      actor: req.apexUser,
      ipAddress: getClientIp(req),
      targetResource: 'settings/telegram',
      forceTest: true
    });
    res.json({ status: result.ok ? 'ok' : 'error', ...result });
  } catch (err) {
    res.status(500).json({ error: 'telegram_test_error', message: err.message });
  }
});

router.post('/api/settings/notifications/test-email', async (req, res) => {
  try {
    if (!req.apexUser?.permissions?.includes('users')) {
      return res.status(403).json({ error: 'forbidden', message: 'เฉพาะผู้ดูแลระบบเท่านั้น' });
    }
    const s = await db.getSystemSettings();
    const to = String(req.body?.to || req.apexUser.email || s.smtp_user || '').trim();
    if (!to) {
      return res.status(400).json({
        error: 'missing_recipient',
        message: 'กรุณาระบุอีเมลปลายทางสำหรับการทดสอบ'
      });
    }
    const result = await notifier.sendEmailNotification({
      to,
      subject: '[APEX Security] ทดสอบการส่งอีเมลและ OTP',
      text: `นี่คือข้อความทดสอบระบบส่งอีเมลและรหัส OTP ของ APEX (${s.app_domain || 'https://apex.windowasia.com'}) โดย ${req.apexUser.name || req.apexUser.id}`,
      html: `<p>ทดสอบระบบส่งอีเมลแจ้งเตือนและ OTP ของ <strong>APEX</strong> สำเร็จ (ผู้ทดสอบ: ${req.apexUser.name || req.apexUser.id})</p>`,
      eventType: 'manual_test',
      actor: req.apexUser,
      ipAddress: getClientIp(req),
      targetResource: 'settings/email',
      forceTest: true
    });
    res.json({ status: result.ok ? 'ok' : 'error', ...result });
  } catch (err) {
    res.status(500).json({ error: 'email_test_error', message: err.message });
  }
});

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
      ciam_base_url: s.ciam_issuer_url || 'https://ciam.windowasia.com',
      client_id: s.ciam_client_id || 'apex-spoke-client',
      login_button_label: 'เข้าสู่ระบบด้วย Window Asia SSO',
      fallback_ad_available: true
    });
  } catch (err) {
    res.status(500).json({ error: 'sso_config_error', message: err.message });
  }
});

router.post('/api/auth/login', authRateLimiter, async (req, res) => {
  try {
    const passedGuards = await checkBotDefenseGuards(req, res, {
      targetResource: '/api/auth/login',
      checkTiming: true
    });
    if (!passedGuards) return;

    const { identifier, password } = req.body || {};
    const s = await db.getSystemSettings();
    const users = await db.getCollection('users');
    const cleanId = String(identifier || '').trim().toLowerCase();
    const clientIp = getClientIp(req);

    if (!cleanId || !password) {
      return res.status(400).json({
        error: 'missing_credentials',
        message: 'กรุณาระบุรหัสผู้ใช้งานและรหัสผ่านให้ครบถ้วน'
      });
    }

    let userRecord = findUserFlexible(users, cleanId);

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

    const isExternal = isExternalAccount(userRecord);
    const isAdUser = isAdManagedAccount(userRecord);

    // 3-Tier Policy (1a): Internal Users with AD Account MUST login via AD SSO only
    if (isAdUser) {
      if (s.ciam_enabled === 'true' && s.break_glass_enabled !== 'true') {
        await db.insertAuditLog({
          eventCode: 'SSO-02',
          actorId: userRecord.id,
          actorEmail: userRecord.email || cleanId,
          actorRole: userRecord.role,
          ipAddress: clientIp,
          targetResource: '/api/auth/login',
          details: { reason: 'ad_account_must_use_sso', ciam_enabled: true }
        });
        return res.status(403).json({
          error: 'ad_sso_required',
          message: 'บัญชีนี้เป็นบัญชีพนักงาน AD กรุณาเข้าสู่ระบบผ่านปุ่ม Window Asia Central IAM (SSO) เท่านั้น'
        });
      }
      if (s.break_glass_enabled !== 'true' && !userRecord.password_hash) {
        await db.insertAuditLog({
          eventCode: 'SSO-02',
          actorId: userRecord.id,
          actorEmail: userRecord.email || cleanId,
          actorRole: userRecord.role,
          ipAddress: clientIp,
          targetResource: '/api/auth/login',
          details: { reason: 'ad_account_must_use_sso', no_local_password: true }
        });
        return res.status(403).json({
          error: 'ad_sso_required',
          message: 'บัญชีนี้เป็นบัญชีพนักงาน AD (ไม่มีรหัสผ่าน Local) กรุณาเข้าสู่ระบบผ่าน Central IAM SSO'
        });
      }
    }

    // 3-Tier Policy (1b & 2): Non-AD Local Users without initial password must complete First-Time Registration
    if (!isAdUser && !userRecord.password_hash && userRecord.id !== 'U01') {
      return res.status(403).json({
        error: 'registration_required',
        username: userRecord.username || userRecord.id,
        message: 'บัญชีนี้ยังไม่ได้ตั้งรหัสผ่านครั้งแรก กรุณาลงทะเบียนเข้าใช้งานครั้งแรกด้วยรหัสเชิญ/OTP'
      });
    }

    // Verify per-user password_hash (or primary admin U01's admin_password_hash ONLY)
    let passwordValid = false;
    let usedBreakGlassGateway = false;
    if (userRecord.password_hash) {
      passwordValid = db.verifyPassword(String(password), userRecord.password_hash);
    } else if (userRecord.id === 'U01' && s.admin_password_hash) {
      passwordValid = db.verifyPassword(String(password), s.admin_password_hash);
    }

    // Break-Glass Direct AD Gateway Fallback (Spec Section B.4 & Section 9)
    if (!passwordValid && s.break_glass_enabled === 'true' && isAdUser) {
      const gwBase = (s.break_glass_url || 'http://172.18.0.1:3100').replace(/\/+$/, '');
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 4000);
      try {
        const gwResp = await fetch(`${gwBase}/api/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({
            username: userRecord.username || userRecord.uid || cleanId,
            password: String(password)
          }),
          signal: controller.signal
        });
        clearTimeout(timer);
        if (gwResp.ok) {
          passwordValid = true;
          usedBreakGlassGateway = true;
        }
      } catch (_) {
        clearTimeout(timer);
      }
    }

    if (!passwordValid) {
      if (userRecord.otp_password_verified_until || userRecord.otp_purpose === 'login_2fa') {
        await db.updateDoc(
          'users',
          userRecord.id,
          {
            otp_password_verified_at: null,
            otp_password_verified_until: null,
            otp_code_hash: null,
            otp_expires_at: null,
            otp_attempts: 0,
            otp_purpose: null
          },
          userRecord.id
        );
      }
      await db.insertAuditLog({
        eventCode: 'SSO-02',
        actorId: userRecord.id,
        actorEmail: userRecord.email || cleanId,
        actorRole: userRecord.role,
        ipAddress: clientIp,
        targetResource: '/api/auth/login',
        details: { reason: 'invalid_password' }
      });
      if (s.telegram_enabled === 'true' && s.telegram_notify_security_alert === 'true') {
        await notifier.sendTelegramNotification({
          text: `<b>[APEX Security Alert]</b> ความพยายามเข้าสู่ระบบรหัสผ่านไม่ถูกต้อง (SSO-02)\n• บัญชี: <code>${userRecord.username || userRecord.id}</code>\n• IP: <code>${clientIp}</code>`,
          eventType: 'security_alert_sso02',
          actor: userRecord,
          ipAddress: clientIp,
          targetResource: '/api/auth/login'
        }).catch(() => {});
      }
      return res.status(401).json({
        error: 'invalid_credentials',
        message: 'รหัสผู้ใช้งานหรือรหัสผ่านไม่ถูกต้อง'
      });
    }

    // Optional 2FA OTP Challenge for External or OTP-enabled Local Accounts
    if (!isAdUser && (userRecord.otp_enabled === true || (isExternal && s.login_otp_external === 'true'))) {
      const nowIso = new Date().toISOString();
      const pwdVerifiedUntil = new Date(Date.now() + 10 * 60 * 1000).toISOString();
      const verifiedUser = await db.updateDoc(
        'users',
        userRecord.id,
        {
          otp_password_verified_at: nowIso,
          otp_password_verified_until: pwdVerifiedUntil
        },
        userRecord.id
      );
      const challenge = await notifier.createAndSendOtpChallenge(verifiedUser || userRecord, 'login_2fa', clientIp);
      return res.json({
        status: 'otp_required',
        otp_required: true,
        identifier: userRecord.username || userRecord.id,
        masked_email: challenge.masked_email,
        expires_at: challenge.expires_at,
        message: 'กรุณากรอกรหัส OTP 6 หลักที่ส่งไปยังอีเมล/Telegram ของคุณ'
      });
    }

    // MANDATORY RULE: 90-Day Forced Password Rotation (Spec v2.12.0 หมวด G - Local Only)
    let mustChangePassword = false;
    let passwordExpired = false;
    let daysLeft = 90;

    if (!isAdUser) {
      const expiry = checkPasswordExpiry90Days(userRecord.password_changed_at, userRecord.createdAt);
      passwordExpired = expiry.expired;
      daysLeft = expiry.daysLeft;
      mustChangePassword = Boolean(userRecord.must_change_password) || expiry.expired;
    }

    const { sessionPayload } = await issueUserSession(req, res, userRecord, {
      authMethod: usedBreakGlassGateway ? 'break_glass_ad' : 'local_credentials',
      mustChangePassword,
      settings: s
    });

    await db.insertAuditLog({
      eventCode: usedBreakGlassGateway ? 'BG-02' : 'SSO-01',
      actorId: userRecord.id,
      actorEmail: userRecord.email || cleanId,
      actorRole: userRecord.role,
      ipAddress: clientIp,
      targetResource: '/api/auth/login',
      details: {
        auth_method: sessionPayload.authMethod,
        app_code: 'apex',
        is_ad_user: isAdUser,
        must_change_password: mustChangePassword,
        ...(usedBreakGlassGateway ? { gateway: s.break_glass_url || 'http://172.18.0.1:3100' } : {})
      }
    });

    if (s.telegram_enabled === 'true' && s.telegram_notify_login === 'true') {
      await notifier.sendTelegramNotification({
        text: `<b>[APEX Login]</b> เข้าสู่ระบบสำเร็จ (${sessionPayload.authMethod})\n• ผู้ใช้: <b>${userRecord.name}</b> (<code>${userRecord.username || userRecord.id}</code>)\n• บทบาท: ${userRecord.role}\n• IP: <code>${clientIp}</code>`,
        eventType: 'login_success',
        actor: userRecord,
        ipAddress: clientIp,
        targetResource: '/api/auth/login'
      }).catch(() => {});
    }

    res.json({
      status: 'ok',
      message: `เข้าสู่ระบบสำเร็จในชื่อ ${userRecord.name}`,
      must_change_password: mustChangePassword,
      password_expired: passwordExpired,
      password_days_left: daysLeft,
      user: buildAuthUserProfile(userRecord, isAdUser)
    });
  } catch (err) {
    res.status(500).json({ error: 'login_error', message: err.message });
  }
});

/**
 * Request an Email/Telegram 6-digit OTP for First-Time Registration or 2FA Login Verification
 */
router.post('/api/auth/otp/request', authRateLimiter, async (req, res) => {
  try {
    const passedGuards = await checkBotDefenseGuards(req, res, {
      targetResource: '/api/auth/otp/request',
      checkTiming: false
    });
    if (!passedGuards) return;

    const { identifier, purpose } = req.body || {};
    const cleanId = String(identifier || '').trim();
    const clientIp = getClientIp(req);
    if (!cleanId) {
      return res.status(400).json({ error: 'missing_identifier', message: 'กรุณาระบุ Username หรืออีเมล' });
    }

    const users = await db.getCollection('users');
    const userRecord = findUserFlexible(users, cleanId);
    if (!userRecord) {
      return res.status(404).json({ error: 'user_not_found', message: 'ไม่พบบัญชีผู้ใช้งานในระบบ' });
    }
    if (userRecord.active === false) {
      await db.insertAuditLog({
        eventCode: 'SSO-04',
        actorId: userRecord.id,
        actorEmail: userRecord.email || cleanId,
        actorRole: userRecord.role,
        ipAddress: clientIp,
        targetResource: '/api/auth/otp/request',
        details: { reason: 'inactive_account_blocked' }
      });
      return res.status(403).json({ error: 'account_inactive', message: 'บัญชีนี้ถูกระงับการใช้งาน (SSO-04)' });
    }
    if (isAdManagedAccount(userRecord)) {
      return res.status(400).json({
        error: 'ad_sso_required',
        message: 'บัญชีพนักงาน AD ใช้การยืนยันตัวตนผ่าน Central IAM SSO ไม่ต้องขอรหัส OTP Local'
      });
    }

    const rawPurpose =
      purpose === undefined || purpose === null || purpose === ''
        ? 'login_2fa'
        : String(purpose).trim();
    if (!['register', 'login_2fa'].includes(rawPurpose)) {
      return res.status(400).json({
        error: 'invalid_otp_purpose',
        message: 'วัตถุประสงค์ของรหัส OTP ไม่ถูกต้อง (รองรับเฉพาะ register หรือ login_2fa)'
      });
    }

    if (rawPurpose === 'register') {
      const hasPendingInvite =
        userRecord.registration_status === 'pending_invite' ||
        Boolean(userRecord.invite_token_hash || userRecord.invite_otp_hash);
      if (userRecord.password_hash && !hasPendingInvite) {
        await db.insertAuditLog({
          eventCode: 'OTP-FAIL',
          actorId: userRecord.id,
          actorEmail: userRecord.email || cleanId,
          actorRole: userRecord.role,
          ipAddress: clientIp,
          targetResource: '/api/auth/otp/request',
          details: { reason: 'register_otp_requested_for_already_registered_user' }
        });
        return res.status(403).json({
          error: 'already_registered',
          message: 'บัญชีนี้ตั้งรหัสผ่านแล้ว ไม่สามารถขอรหัส OTP สำหรับลงทะเบียนครั้งแรกได้'
        });
      }
    } else {
      const pwdVerifiedOk =
        Boolean(userRecord.password_hash) &&
        userRecord.otp_password_verified_until &&
        new Date(userRecord.otp_password_verified_until).getTime() > Date.now();
      if (!pwdVerifiedOk) {
        await db.insertAuditLog({
          eventCode: 'OTP-FAIL',
          actorId: userRecord.id,
          actorEmail: userRecord.email || cleanId,
          actorRole: userRecord.role,
          ipAddress: clientIp,
          targetResource: '/api/auth/otp/request',
          details: { reason: 'password_not_verified_before_otp_request' }
        });
        return res.status(403).json({
          error: 'password_verification_required',
          message: 'กรุณายืนยันรหัสผ่านที่หน้าเข้าสู่ระบบให้ผ่านก่อนขอรหัส 2FA OTP'
        });
      }
    }

    const challenge = await notifier.createAndSendOtpChallenge(
      userRecord,
      rawPurpose,
      clientIp
    );

    res.json({
      status: 'ok',
      masked_email: challenge.masked_email,
      expires_at: challenge.expires_at,
      message: challenge.masked_email
        ? `ส่งรหัส OTP 6 หลักไปยัง ${challenge.masked_email} และ Telegram แล้ว`
        : 'สร้างรหัส OTP 6 หลักและแจ้งเตือนเรียบร้อยแล้ว'
    });
  } catch (err) {
    res.status(500).json({ error: 'otp_request_error', message: err.message });
  }
});

/**
 * First-Time Registration & Password Activation for Non-AD Local Users
 */
router.post('/api/auth/register-first-time', authRateLimiter, async (req, res) => {
  try {
    const passedGuards = await checkBotDefenseGuards(req, res, {
      targetResource: '/api/auth/register-first-time',
      checkTiming: true
    });
    if (!passedGuards) return;

    const { identifier, token_or_otp, new_password } = req.body || {};
    const cleanId = String(identifier || '').trim();
    const code = String(token_or_otp || '').trim();
    const pwd = String(new_password || '').trim();
    const clientIp = getClientIp(req);

    if (!cleanId || !code || !pwd) {
      return res.status(400).json({
        error: 'missing_fields',
        message: 'กรุณากรอก Username, รหัสลงทะเบียน/OTP และรหัสผ่านใหม่ให้ครบถ้วน'
      });
    }

    const s = await db.getSystemSettings();
    const users = await db.getCollection('users');
    const userRecord = findUserFlexible(users, cleanId);
    if (!userRecord) {
      return res.status(404).json({ error: 'user_not_found', message: 'ไม่พบบัญชีผู้ใช้งานในระบบ' });
    }
    if (userRecord.active === false) {
      await db.insertAuditLog({
        eventCode: 'SSO-04',
        actorId: userRecord.id,
        actorEmail: userRecord.email || cleanId,
        actorRole: userRecord.role,
        ipAddress: clientIp,
        targetResource: '/api/auth/register-first-time',
        details: { reason: 'inactive_account_blocked' }
      });
      return res.status(403).json({ error: 'account_inactive', message: 'บัญชีนี้ถูกระงับการใช้งาน (SSO-04)' });
    }
    if (isAdManagedAccount(userRecord)) {
      return res.status(403).json({
        error: 'ad_sso_required',
        message: 'บัญชีพนักงาน AD ใช้การล็อกอินผ่าน Central IAM SSO เท่านั้น'
      });
    }

    const nowMs = Date.now();
    const inviteNotExpired =
      userRecord.invite_expires_at && new Date(userRecord.invite_expires_at).getTime() > nowMs;
    const otpNotExpired =
      userRecord.otp_expires_at &&
      new Date(userRecord.otp_expires_at).getTime() > nowMs &&
      Number(userRecord.otp_attempts || 0) < 5;

    const matchesInvite =
      inviteNotExpired &&
      (db.verifyPassword(code, userRecord.invite_token_hash) ||
        db.verifyPassword(code, userRecord.invite_otp_hash));
    const matchesOtpHash = otpNotExpired && db.verifyPassword(code, userRecord.otp_code_hash);

    if (!matchesInvite && matchesOtpHash && userRecord.otp_purpose !== 'register') {
      await db.updateDoc(
        'users',
        userRecord.id,
        { otp_attempts: Number(userRecord.otp_attempts || 0) + 1 },
        userRecord.id
      );
      await db.insertAuditLog({
        eventCode: 'OTP-FAIL',
        actorId: userRecord.id,
        actorEmail: userRecord.email || cleanId,
        actorRole: userRecord.role,
        ipAddress: clientIp,
        targetResource: '/api/auth/register-first-time',
        details: {
          reason: 'otp_purpose_mismatch',
          expected_purpose: 'register',
          actual_purpose: userRecord.otp_purpose || null
        }
      });
      return res.status(400).json({
        error: 'otp_purpose_mismatch',
        message: 'ห้ามนำรหัส OTP ที่ออกสำหรับวัตถุประสงค์อื่นมาใช้ตั้งรหัสผ่านครั้งแรก'
      });
    }

    const matchesOtp = matchesOtpHash && userRecord.otp_purpose === 'register';

    if (!matchesInvite && !matchesOtp) {
      if (userRecord.otp_code_hash) {
        await db.updateDoc(
          'users',
          userRecord.id,
          { otp_attempts: Number(userRecord.otp_attempts || 0) + 1 },
          userRecord.id
        );
      }
      await db.insertAuditLog({
        eventCode: 'OTP-FAIL',
        actorId: userRecord.id,
        actorEmail: userRecord.email || cleanId,
        actorRole: userRecord.role,
        ipAddress: clientIp,
        targetResource: '/api/auth/register-first-time',
        details: { reason: 'invalid_or_expired_invite_otp' }
      });
      return res.status(401).json({
        error: 'invalid_or_expired_token',
        message: 'รหัสเชิญ หรือรหัส OTP ไม่ถูกต้องหรือหมดอายุแล้ว กรุณาขอรหัสใหม่จากผู้ดูแลระบบ'
      });
    }

    if (userRecord.password_hash && userRecord.registration_status !== 'pending_invite' && !matchesInvite) {
      await db.insertAuditLog({
        eventCode: 'OTP-FAIL',
        actorId: userRecord.id,
        actorEmail: userRecord.email || cleanId,
        actorRole: userRecord.role,
        ipAddress: clientIp,
        targetResource: '/api/auth/register-first-time',
        details: { reason: 'already_registered' }
      });
      return res.status(403).json({
        error: 'already_registered',
        message: 'บัญชีนี้ลงทะเบียนและตั้งรหัสผ่านแล้ว กรุณาเข้าสู่ระบบตามปกติ'
      });
    }

    const usernameForCheck = String(userRecord.username || userRecord.uid || userRecord.id).trim();
    const compErr = validatePasswordComplexity(pwd, usernameForCheck);
    if (compErr) {
      return res.status(400).json({ error: 'complexity_violation', message: compErr });
    }

    const nowIso = new Date().toISOString();
    const updatedUser = await db.updateDoc(
      'users',
      userRecord.id,
      {
        password_hash: db.hashPassword(pwd),
        password_changed_at: nowIso,
        must_change_password: false,
        registration_status: 'registered',
        invite_token_hash: null,
        invite_otp_hash: null,
        invite_expires_at: null,
        otp_code_hash: null,
        otp_expires_at: null,
        otp_attempts: 0,
        otp_purpose: null,
        otp_password_verified_at: null,
        otp_password_verified_until: null
      },
      userRecord.id
    );

    await issueUserSession(req, res, updatedUser, {
      authMethod: 'first_time_register',
      mustChangePassword: false,
      settings: s
    });

    await db.insertAuditLog({
      eventCode: 'USER-REGISTER',
      actorId: userRecord.id,
      actorEmail: userRecord.email || cleanId,
      actorRole: userRecord.role,
      ipAddress: clientIp,
      targetResource: `users/${userRecord.id}`,
      details: {
        username: usernameForCheck,
        kind: userRecord.kind || 'external',
        method: matchesInvite ? 'invite_token_or_otp' : 'self_service_otp'
      }
    });

    if (userRecord.email) {
      await notifier.sendEmailNotification({
        to: userRecord.email,
        subject: '[APEX] ลงทะเบียนเปิดใช้งานบัญชีเรียบร้อยแล้ว',
        text: `บัญชีของคุณ (${usernameForCheck}) ตั้งรหัสผ่านครั้งแรกและเปิดใช้งานในระบบ APEX เรียบร้อยแล้ว`,
        eventType: 'first_time_registration_complete',
        actor: updatedUser,
        ipAddress: clientIp,
        targetResource: `users/${userRecord.id}`
      }).catch(() => {});
    }

    if (s.telegram_enabled === 'true' && s.telegram_notify_user_provision === 'true') {
      await notifier.sendTelegramNotification({
        text: `<b>[APEX Onboarding]</b> ผู้ใช้ลงทะเบียนตั้งรหัสผ่านครั้งแรกสำเร็จ\n• ผู้ใช้: <b>${userRecord.name}</b> (<code>${usernameForCheck}</code>)\n• IP: <code>${clientIp}</code>`,
        chatId: userRecord.telegram_chat_id || '',
        eventType: 'first_time_registration_complete',
        actor: updatedUser,
        ipAddress: clientIp,
        targetResource: `users/${userRecord.id}`
      }).catch(() => {});
    }

    res.json({
      status: 'ok',
      message: 'ลงทะเบียนตั้งรหัสผ่านครั้งแรกสำเร็จ กำลังเข้าสู่ระบบ...',
      must_change_password: false,
      user: buildAuthUserProfile(updatedUser, false)
    });
  } catch (err) {
    res.status(500).json({ error: 'register_error', message: err.message });
  }
});

/**
 * 2FA OTP Verification Step for Local / External Logins
 */
router.post('/api/auth/otp/verify', authRateLimiter, async (req, res) => {
  try {
    const passedGuards = await checkBotDefenseGuards(req, res, {
      targetResource: '/api/auth/otp/verify',
      checkTiming: false
    });
    if (!passedGuards) return;

    const { identifier, otp_code } = req.body || {};
    const cleanId = String(identifier || '').trim();
    const code = String(otp_code || '').trim();
    const clientIp = getClientIp(req);

    if (!cleanId || !code) {
      return res.status(400).json({ error: 'missing_otp', message: 'กรุณากรอก Username และรหัส OTP 6 หลัก' });
    }

    const s = await db.getSystemSettings();
    const users = await db.getCollection('users');
    const userRecord = findUserFlexible(users, cleanId);
    if (!userRecord) {
      return res.status(401).json({ error: 'invalid_otp', message: 'ข้อมูลไม่ถูกต้อง' });
    }
    if (userRecord.active === false) {
      await db.insertAuditLog({
        eventCode: 'SSO-04',
        actorId: userRecord.id,
        actorEmail: userRecord.email || cleanId,
        actorRole: userRecord.role,
        ipAddress: clientIp,
        targetResource: '/api/auth/otp/verify',
        details: { reason: 'inactive_account_blocked' }
      });
      return res.status(403).json({ error: 'account_inactive', message: 'บัญชีนี้ถูกระงับการใช้งาน (SSO-04)' });
    }

    if (userRecord.otp_code_hash && userRecord.otp_purpose !== 'login_2fa') {
      const nextAttempts = Number(userRecord.otp_attempts || 0) + 1;
      await db.updateDoc('users', userRecord.id, { otp_attempts: nextAttempts }, userRecord.id);
      await db.insertAuditLog({
        eventCode: 'OTP-FAIL',
        actorId: userRecord.id,
        actorEmail: userRecord.email || cleanId,
        actorRole: userRecord.role,
        ipAddress: clientIp,
        targetResource: '/api/auth/otp/verify',
        details: {
          reason: 'otp_purpose_mismatch',
          expected_purpose: 'login_2fa',
          actual_purpose: userRecord.otp_purpose || null,
          attempts: nextAttempts
        }
      });
      return res.status(400).json({
        error: 'otp_purpose_mismatch',
        message: 'รหัส OTP นี้ไม่ได้ออกสำหรับการยืนยันตัวตนเข้าสู่ระบบ (2FA) ห้ามใช้ผิดวัตถุประสงค์'
      });
    }

    const pwdVerifiedOk =
      Boolean(userRecord.password_hash) &&
      userRecord.otp_password_verified_until &&
      new Date(userRecord.otp_password_verified_until).getTime() > Date.now();
    if (!pwdVerifiedOk) {
      await db.insertAuditLog({
        eventCode: 'OTP-FAIL',
        actorId: userRecord.id,
        actorEmail: userRecord.email || cleanId,
        actorRole: userRecord.role,
        ipAddress: clientIp,
        targetResource: '/api/auth/otp/verify',
        details: { reason: 'password_not_verified_before_otp_verify' }
      });
      return res.status(403).json({
        error: 'password_verification_required',
        message: 'กรุณายืนยันรหัสผ่านที่หน้าเข้าสู่ระบบให้ผ่านก่อนใช้รหัส 2FA OTP'
      });
    }

    if (
      !userRecord.otp_code_hash ||
      !userRecord.otp_expires_at ||
      new Date(userRecord.otp_expires_at).getTime() <= Date.now()
    ) {
      return res.status(401).json({
        error: 'otp_expired',
        message: 'รหัส OTP หมดอายุหรือยังไม่ได้ขอรหัส กรุณาขอรหัส OTP ใหม่'
      });
    }

    const attempts = Number(userRecord.otp_attempts || 0);
    if (attempts >= 5) {
      return res.status(429).json({
        error: 'otp_max_attempts',
        message: 'กรอกรหัส OTP ผิดเกิน 5 ครั้ง กรุณาขอรหัส OTP ใหม่'
      });
    }

    if (!db.verifyPassword(code, userRecord.otp_code_hash)) {
      await db.updateDoc('users', userRecord.id, { otp_attempts: attempts + 1 }, userRecord.id);
      await db.insertAuditLog({
        eventCode: 'OTP-FAIL',
        actorId: userRecord.id,
        actorEmail: userRecord.email || cleanId,
        actorRole: userRecord.role,
        ipAddress: clientIp,
        targetResource: '/api/auth/otp/verify',
        details: { attempts: attempts + 1 }
      });
      return res.status(401).json({ error: 'invalid_otp', message: 'รหัส OTP ไม่ถูกต้อง' });
    }

    const clearedUser = await db.updateDoc(
      'users',
      userRecord.id,
      {
        otp_code_hash: null,
        otp_expires_at: null,
        otp_attempts: 0,
        otp_purpose: null,
        otp_password_verified_at: null,
        otp_password_verified_until: null
      },
      userRecord.id
    );

    const isAdUser = isAdManagedAccount(clearedUser);
    let mustChangePassword = false;
    let passwordExpired = false;
    let daysLeft = 90;
    if (!isAdUser) {
      const expiry = checkPasswordExpiry90Days(clearedUser.password_changed_at, clearedUser.createdAt);
      passwordExpired = expiry.expired;
      daysLeft = expiry.daysLeft;
      mustChangePassword = Boolean(clearedUser.must_change_password) || expiry.expired;
    }

    await issueUserSession(req, res, clearedUser, {
      authMethod: 'local_otp_2fa',
      mustChangePassword,
      settings: s
    });

    await db.insertAuditLog({
      eventCode: 'OTP-VERIFY',
      actorId: clearedUser.id,
      actorEmail: clearedUser.email || cleanId,
      actorRole: clearedUser.role,
      ipAddress: clientIp,
      targetResource: '/api/auth/otp/verify',
      details: { username: clearedUser.username || clearedUser.id }
    });

    if (s.telegram_enabled === 'true' && s.telegram_notify_login === 'true') {
      await notifier.sendTelegramNotification({
        text: `<b>[APEX Login 2FA OTP]</b> เข้าสู่ระบบสำเร็จ\n• ผู้ใช้: <b>${clearedUser.name}</b> (<code>${clearedUser.username || clearedUser.id}</code>)\n• IP: <code>${clientIp}</code>`,
        eventType: 'login_otp_verified',
        actor: clearedUser,
        ipAddress: clientIp,
        targetResource: '/api/auth/otp/verify'
      }).catch(() => {});
    }

    res.json({
      status: 'ok',
      message: `ยืนยัน OTP และเข้าสู่ระบบสำเร็จในชื่อ ${clearedUser.name}`,
      must_change_password: mustChangePassword,
      password_expired: passwordExpired,
      password_days_left: daysLeft,
      user: buildAuthUserProfile(clearedUser, isAdUser)
    });
  } catch (err) {
    res.status(500).json({ error: 'otp_verify_error', message: err.message });
  }
});

/**
 * Admin Endpoint: Generate & Dispatch First-Time Registration Invite + OTP for Non-AD User
 */
router.post('/api/v1/users/:id/send-invite', async (req, res) => {
  try {
    if (!req.apexUser?.permissions?.includes('users')) {
      return res.status(403).json({ error: 'forbidden', message: 'เฉพาะผู้ดูแลระบบเท่านั้น' });
    }
    const users = await db.getCollection('users');
    const userRecord = users.find(u => u.id === req.params.id);
    if (!userRecord) {
      return res.status(404).json({ error: 'user_not_found', message: 'ไม่พบบัญชีผู้ใช้ที่ต้องการส่งคำเชิญ' });
    }
    if (isAdManagedAccount(userRecord)) {
      return res.status(400).json({
        error: 'ad_user_no_invite_needed',
        message: 'บัญชีพนักงาน AD ใช้การล็อกอินผ่าน Central IAM SSO ไม่ต้องส่งลิงก์ตั้งรหัสผ่าน Local'
      });
    }

    const invite = await notifier.createRegistrationInvite(userRecord, req.apexUser, getClientIp(req));
    res.json({
      status: 'ok',
      message: `สร้างคำเชิญลงทะเบียนเข้าใช้งานครั้งแรกให้ ${userRecord.name || userRecord.id} เรียบร้อยแล้ว`,
      username: userRecord.username || userRecord.uid || userRecord.id,
      email: userRecord.email || '',
      ...invite
    });
  } catch (err) {
    res.status(500).json({ error: 'invite_error', message: err.message });
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
    const userIdentity =
      userRecord.username ||
      userRecord.uid ||
      (userRecord.email ? String(userRecord.email).split('@')[0] : '') ||
      userRecord.id;
    const complexityErr = validatePasswordComplexity(String(new_password).trim(), userIdentity);
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
    if (cookies.apex_session) {
      const sess = ssoSessions.get(cookies.apex_session) || (await db.getSession(cookies.apex_session));
      if (sess) {
        sess.mustChangePassword = false;
        ssoSessions.set(cookies.apex_session, sess);
        await db.saveSession(cookies.apex_session, sess);
      }
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
async function clearApexSessionCookie(req, res) {
  const cookies = parseCookies(req?.headers?.cookie || '');
  const existingToken = cookies.apex_session;
  const existingSession = existingToken
    ? (ssoSessions.get(existingToken) || (await db.getSession(existingToken)))
    : null;
  if (existingToken) {
    ssoSessions.delete(existingToken);
    await db.deleteSession(existingToken);
  }
  if (res && typeof res.setHeader === 'function') {
    const secureFlag = isHttpsRequest(req) ? '; Secure' : '';
    res.setHeader('Set-Cookie', `apex_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secureFlag}`);
  }
  return existingSession;
}

router.get('/auth/start', async (req, res) => {
  await clearApexSessionCookie(req, res);
  if (req.query?.code && req.query?.state) {
    const qs = new URLSearchParams(req.query).toString();
    return res.redirect(`/api/auth/sso/callback?${qs}`);
  }
  const s = await db.getSystemSettings();
  if (s.ciam_enabled === 'true') {
    return res.redirect('/api/auth/sso/login');
  }
  return res.redirect('/');
});

router.get('/api/auth/sso/login', async (req, res) => {
  try {
    await clearApexSessionCookie(req, res);
    const s = await db.getSystemSettings();
    const baseIssuer =
      s.break_glass_enabled === 'true'
        ? (s.break_glass_url || 'http://172.18.0.1:3100').replace(/\/+$/, '')
        : (s.ciam_issuer_url || 'https://ciam.windowasia.com').replace(/\/+$/, '');

    const codeVerifier = crypto.randomBytes(32).toString('base64url');
    const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
    const state = crypto.randomBytes(16).toString('hex');
    const redirectUri = s.ciam_redirect_uri || 'https://apex.windowasia.com/api/auth/sso/callback';

    pkceStore.set(state, {
      codeVerifier,
      redirectUri,
      createdAt: Date.now(),
      returnTo: req.query.return_to || '/'
    });

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: s.ciam_client_id || 'apex-spoke-client',
      redirect_uri: redirectUri,
      scope: 'openid profile email roles',
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256'
    });

    res.redirect(`${baseIssuer}/oauth/authorize?${params.toString()}`);
  } catch (err) {
    res.status(500).json({ error: 'sso_login_error', message: err.message });
  }
});

async function handleSsoCallback(req, res) {
  try {
    await clearApexSessionCookie(req, res);
    const { code, state } = req.query || {};
    const stateStr = state ? String(state) : '';
    const pkce = stateStr ? pkceStore.get(stateStr) : null;
    if (stateStr) pkceStore.delete(stateStr);

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
    const isPortalDirectLaunch = Boolean(stateStr && stateStr.startsWith('ciam_launch_'));
    if (!code || !stateStr || (!pkceValid && !isPortalDirectLaunch)) {
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

    const appDomain = (s.app_domain || 'https://apex.windowasia.com').replace(/\/+$/, '');
    const reqPath = String(req.path || '');
    const origPath = String(req.query?._sso_orig_path || '');
    const primaryRedirectUri =
      pkce?.redirectUri ||
      (reqPath === '/auth/callback'
        ? `${appDomain}/auth/callback`
        : origPath === '/'
          ? appDomain
          : (s.ciam_redirect_uri || `${appDomain}/api/auth/sso/callback`));

    const redirectCandidates = pkceValid
      ? [primaryRedirectUri]
      : [...new Set([
          primaryRedirectUri,
          s.ciam_redirect_uri,
          `${appDomain}/api/auth/sso/callback`,
          `${appDomain}/auth/callback`,
          appDomain,
          `${appDomain}/`
        ].filter(Boolean))];

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    let verifiedEmail = '';
    let verifiedSub = '';
    let verifiedName = '';
    let verifiedRole = '';
    let verifiedDept = '';
    let verifiedCiamOriginIp = CIAM_ORIGIN_IP;
    try {
      let tokenResp = null;
      for (const candidateRedirect of redirectCandidates) {
        const tokenParams = new URLSearchParams({
          grant_type: 'authorization_code',
          code: String(code),
          redirect_uri: candidateRedirect,
          client_id: s.ciam_client_id || 'apex-spoke-client',
          client_secret: s.ciam_client_secret
        });
        if (pkce?.codeVerifier) {
          tokenParams.set('code_verifier', pkce.codeVerifier);
        }

        tokenResp = await fetch(`${baseIssuer}/api/v1/oauth/token`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Accept: 'application/json'
          },
          body: tokenParams.toString(),
          signal: controller.signal
        });

        if (tokenResp.ok || tokenResp.status !== 400 || pkceValid) {
          break;
        }
      }

      if (!tokenResp || !tokenResp.ok) {
        clearTimeout(timer);
        await db.insertAuditLog({
          eventCode: 'SSO-02',
          ipAddress: getClientIp(req),
          targetResource: '/api/auth/sso/callback',
          details: { reason: 'token_exchange_failed', status: tokenResp ? tokenResp.status : 'no_response' }
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

      const userInfoResp = await fetch(`${baseIssuer}/api/v1/oauth/userinfo`, {
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
      verifiedSub = String(profile.preferred_username || profile.username || profile.sub || '').trim();
      verifiedName = String(profile.name || profile.full_name || verifiedSub || '').trim();
      const rawRoles =
        profile.roles && typeof profile.roles === 'object' && !Array.isArray(profile.roles)
          ? (profile.roles[s.app_code || 'apex'] || profile.roles.admin || Object.values(profile.roles)[0] || '')
          : (Array.isArray(profile.roles) ? profile.roles[0] : (profile.roles || ''));
      verifiedRole = String(
        profile.role || rawRoles || (Array.isArray(profile.groups) ? profile.groups[0] : '') || ''
      ).trim();
      verifiedDept = String(profile.department || '').trim();
      verifiedCiamOriginIp =
        String(profile.ciam_origin_ip || tokenData.ciam_origin_ip || CIAM_ORIGIN_IP).trim() || CIAM_ORIGIN_IP;
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
    const subLower = verifiedSub.toLowerCase();
    let userRecord = users.find(u => {
      if (subLower) {
        const ids = [u.uid, u.id, u.username, u.external_id]
          .filter(Boolean)
          .map(x => String(x).trim().toLowerCase());
        if (ids.includes(subLower)) return true;
      }
      if (verifiedEmail && u.email) {
        const uEmail = String(u.email).trim().toLowerCase();
        if (uEmail === 'u01@windowasia.co.th' && subLower && subLower !== 'u01') {
          return false;
        }
        if (uEmail === verifiedEmail) return true;
      }
      return false;
    });

    const nowIso = new Date().toISOString();
    // JIT Auto-Provision verified AD/CIAM user if not yet in APEX users directory
    if (!userRecord) {
      const newUserId = verifiedSub || verifiedEmail.split('@')[0];
      const isCiamAdmin =
        ['SUPER_ADMIN', 'ADMIN', 'admin'].includes(verifiedRole) ||
        ['super_admin', 'admin'].includes(verifiedRole.toLowerCase());
      const defaultProvisionRole = resolveRoleKeyFromCiam(s.ciam_auto_provision_group, null, 'viewer');
      const assignedRole = isCiamAdmin
        ? 'admin'
        : (defaultProvisionRole === 'admin' ? 'viewer' : defaultProvisionRole);
      userRecord = {
        id: newUserId,
        uid: verifiedSub || newUserId,
        username: verifiedSub || newUserId,
        external_id: verifiedSub || newUserId,
        name: verifiedName || verifiedSub || newUserId,
        title: verifiedDept || (isCiamAdmin ? 'ผู้ดูแลระบบ (Central IAM)' : 'พนักงาน (Central IAM)'),
        department: verifiedDept || (isCiamAdmin ? 'IT Security' : 'Operations'),
        email: verifiedEmail || `${newUserId.toLowerCase()}@windowasia.com`,
        role: assignedRole,
        kind: 'internal',
        use_ad_auth: true,
        active: true,
        is_active: true,
        status_origin: 'CIAM',
        projects: 'all',
        grant: [],
        deny: [],
        lastSeen: nowIso,
        last_login_at: nowIso,
        createdAt: nowIso
      };
      await db.setDoc('users', newUserId, userRecord, 'ciam-sso-jit');
      await db.insertAuditLog({
        eventCode: 'DIR-PROVISION',
        actorId: newUserId,
        actorEmail: userRecord.email,
        actorRole: userRecord.role,
        ipAddress: verifiedCiamOriginIp,
        targetResource: `users/${newUserId}`,
        details: {
          reason: 'jit_oidc_auto_provision',
          sub: verifiedSub,
          email: verifiedEmail,
          department: verifiedDept,
          ciam_role: verifiedRole,
          assigned_role: assignedRole,
          client_ip: getClientIp(req),
          ciam_origin_ip: verifiedCiamOriginIp
        }
      });
    }

    // MANDATORY RULE: Inactive Account Guard (SSO-04) - NEVER auto-enable disabled local accounts
    if (userRecord.active === false) {
      await db.insertAuditLog({
        eventCode: 'SSO-04',
        actorId: userRecord.id,
        actorEmail: userRecord.email || verifiedEmail,
        actorRole: userRecord.role,
        ipAddress: verifiedCiamOriginIp,
        targetResource: '/api/auth/sso/callback',
        details: {
          reason: 'inactive_account_blocked',
          status_origin: userRecord.status_origin || 'LOCAL',
          client_ip: getClientIp(req),
          ciam_origin_ip: verifiedCiamOriginIp
        }
      });
      return res.status(403).json({
        error: 'account_inactive',
        code: 'SSO-04',
        message: 'บัญชีผู้ใช้งานของคุณถูกระงับการใช้งานในระบบ APEX กรุณาติดต่อผู้ดูแลระบบ'
      });
    }

    await db.updateDoc(
      'users',
      userRecord.id,
      {
        lastSeen: nowIso,
        last_login_at: nowIso,
        ...(userRecord.username ? {} : { username: verifiedSub || userRecord.uid || userRecord.id }),
        ...(verifiedDept && !userRecord.department ? { department: verifiedDept } : {})
      },
      userRecord.id
    );

    const ttlMinutes = Math.max(5, Number(s.ciam_session_ttl_minutes) || 480);
    const maxAgeSeconds = ttlMinutes * 60;
    const sessionId = crypto.randomBytes(32).toString('hex');
    const sessionPayload = {
      userId: userRecord.id,
      uid: userRecord.uid || verifiedSub || userRecord.id,
      username: userRecord.username || verifiedSub || userRecord.uid || userRecord.id,
      email: userRecord.email || verifiedEmail,
      authMethod: 'ciam_sso',
      mustChangePassword: false,
      authenticatedAt: nowIso,
      expiresAt: Date.now() + maxAgeSeconds * 1000
    };
    ssoSessions.set(sessionId, sessionPayload);
    await db.saveSession(sessionId, sessionPayload);

    await db.insertAuditLog({
      eventCode: 'SSO-01',
      actorId: userRecord.id,
      actorEmail: userRecord.email || verifiedEmail,
      actorRole: userRecord.role,
      ipAddress: verifiedCiamOriginIp,
      targetResource: '/api/auth/sso/callback',
      details: {
        pkce_verified: pkceValid,
        portal_direct_launch: isPortalDirectLaunch,
        app_code: 'apex',
        sub: verifiedSub,
        client_ip: getClientIp(req),
        ciam_origin_ip: verifiedCiamOriginIp
      }
    });

    res.setHeader('Set-Cookie', buildSessionCookie(req, sessionId, maxAgeSeconds));
    res.redirect((pkce && pkce.returnTo) || '/');
  } catch (err) {
    res.status(500).json({ error: 'callback_error', message: err.message });
  }
}

router.get('/api/auth/sso/callback', handleSsoCallback);
router.get('/auth/callback', handleSsoCallback);

async function handleSsoLogout(req, res) {
  try {
    const sess = await clearApexSessionCookie(req, res);
    const s = await db.getSystemSettings();
    const isAdUser = req.apexUser
      ? (req.apexUser.use_ad_auth === true || (req.apexUser.use_ad_auth === undefined && req.apexUser.kind !== 'external'))
      : true;
    const shouldRedirectToCiam = Boolean(sess?.authMethod === 'ciam_sso' || s.ciam_enabled === 'true' || isAdUser);

    await db.insertAuditLog({
      eventCode: 'SSO-03',
      actorId: req.apexUser?.id || sess?.userId || 'unknown',
      actorEmail: req.apexUser?.email || sess?.email || '',
      actorRole: req.apexUser?.role || '',
      ipAddress: getCiamOriginIp(req, { verifiedCiamFlow: true }),
      targetResource: '/api/auth/sso/logout',
      details: {
        action: 'user_logout',
        is_ad_user: isAdUser,
        auth_method: sess?.authMethod || 'local',
        client_ip: getClientIp(req)
      }
    });

    const redirectUri = shouldRedirectToCiam
      ? (s.ciam_portal_url || 'https://ciam.windowasia.com/portal')
      : '/login';

    if (req.method === 'GET') {
      return res.redirect(redirectUri);
    }
    res.json({ status: 'ok', redirect_uri: redirectUri });
  } catch (err) {
    res.status(500).json({ error: 'logout_error', message: err.message });
  }
}

router.post('/api/auth/sso/logout', handleSsoLogout);
router.get('/api/auth/sso/logout', handleSsoLogout);

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
  const originIp = getCiamOriginIp(req);
  const clientIp = getClientIp(req);
  const allowedIps = (s.ciam_allowed_ips || '157.173.219.153,172.18.0.1,127.0.0.1,::1')
    .split(',')
    .map(x => x.trim())
    .filter(Boolean);
  if (!allowedIps.includes(CIAM_ORIGIN_IP)) {
    allowedIps.push(CIAM_ORIGIN_IP);
  }
  if (!allowedIps.includes('172.18.0.1')) {
    allowedIps.push('172.18.0.1');
  }

  if (!allowedIps.includes(originIp) && !allowedIps.includes(clientIp) && !allowedIps.includes('*')) {
    await db.insertAuditLog({
      eventCode: 'DIR-DENY-IP',
      ipAddress: clientIp,
      targetResource: req.originalUrl,
      details: { reason: 'ip_not_whitelisted', clientIp, originIp }
    });
    return res.status(403).json({ error: 'ip_not_allowed', clientIp, originIp });
  }

  const providedKey = req.headers['x-management-api-key'] || '';
  if (!s.ciam_management_api_key || !safeCompare(providedKey, s.ciam_management_api_key)) {
    return res.status(401).json({ error: 'invalid_management_api_key' });
  }
  next();
}

function formatDirectoryAccount(u) {
  const isExternal = u.kind === 'external' || ['contractor', 'customer'].includes(u.role);
  return {
    id: u.id,
    username: u.username || u.uid || u.id,
    external_id: u.external_id || u.uid || u.id,
    full_name: u.name,
    name: u.name,
    email: u.email || '',
    department: u.department || u.title || '',
    group_name: u.group_name || ROLE_DEF[u.role]?.l || u.role,
    role: u.role,
    kind: u.kind || (isExternal ? 'external' : 'internal'),
    use_ad_auth: u.use_ad_auth ?? !isExternal,
    is_active: u.active !== false,
    is_status_locked: Boolean(u.is_status_locked),
    status_origin: u.status_origin || 'LOCAL',
    last_login_at: u.last_login_at || u.lastSeen || null,
    last_seen: u.lastSeen || u.last_login_at || null,
    created_at: u.createdAt || null,
    updated_at: u.updatedAt || null
  };
}

router.get('/api/v1/directory/accounts', verifyCiamManagementAuth, async (req, res) => {
  const users = await db.getCollection('users');
  const statusFilter = String(req.query?.status || 'all').trim().toLowerCase();
  const deptFilter = String(req.query?.department || '').trim().toLowerCase();
  const searchFilter = String(req.query?.search || '').trim().toLowerCase();

  const filtered = users.filter(u => {
    const active = u.active !== false;
    if (statusFilter === 'active' && !active) return false;
    if (statusFilter === 'inactive' && active) return false;
    if (deptFilter && !String(u.department || u.title || '').toLowerCase().includes(deptFilter)) {
      return false;
    }
    if (searchFilter) {
      const hay = [u.id, u.uid, u.username, u.name, u.email, u.department, u.title]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      if (!hay.includes(searchFilter)) return false;
    }
    return true;
  });

  const activeCount = users.filter(u => u.active !== false).length;
  res.json({
    app_code: 'apex',
    application_name: 'APEX (Installation Control System)',
    total: filtered.length,
    total_accounts: users.length,
    active_accounts: activeCount,
    inactive_accounts: users.length - activeCount,
    summary: {
      total: users.length,
      active: activeCount,
      inactive: users.length - activeCount
    },
    accounts: filtered.map(formatDirectoryAccount)
  });
});

router.post('/api/v1/directory/accounts', verifyCiamManagementAuth, async (req, res) => {
  const b = req.body || {};
  const s = await db.getSystemSettings();
  const users = await db.getCollection('users');

  const rawUsername = String(b.username || b.external_id || b.id || '').trim();
  const existing = findUserFlexible(users, rawUsername || b.email || '');
  if (existing && !b.upsert) {
    return res.status(409).json({
      error: 'account_exists',
      username: existing.username || existing.id,
      message: `บัญชี '${rawUsername || existing.id}' มีอยู่ในระบบแล้ว`
    });
  }

  const id = existing?.id || b.id || rawUsername || 'U' + Date.now().toString(36).toUpperCase();
  const username = rawUsername || id;
  const fallbackRole = resolveRoleKeyFromCiam(s.ciam_auto_provision_group, null, 'viewer');
  const resolvedRole = resolveRoleKeyFromCiam(b.role, b.group_name, fallbackRole);
  const kind = b.kind || (['contractor', 'customer'].includes(resolvedRole) ? 'external' : 'internal');
  const nowIso = new Date().toISOString();
  const record = {
    ...(existing || {}),
    id,
    uid: b.external_id || username,
    username,
    external_id: b.external_id || username,
    name: b.full_name || b.name || existing?.name || username || 'CIAM Provisioned User',
    title: b.title || b.department || existing?.title || '',
    department: b.department || b.title || existing?.department || '',
    group_name: b.group_name || ROLE_DEF[resolvedRole]?.l || resolvedRole,
    email: b.email || existing?.email || '',
    phone: b.phone || existing?.phone || '',
    role: resolvedRole,
    kind,
    use_ad_auth: b.use_ad_auth ?? existing?.use_ad_auth ?? kind !== 'external',
    active: b.is_active !== false,
    is_active: b.is_active !== false,
    status_origin: 'CIAM',
    projects: b.projects || existing?.projects || (resolvedRole === 'admin' ? 'all' : []),
    team: b.team || existing?.team || '',
    grant: b.grant || existing?.grant || [],
    deny: b.deny || existing?.deny || [],
    createdAt: existing?.createdAt || nowIso,
    updatedAt: nowIso
  };
  await db.setDoc('users', id, record, 'ciam-push');
  await db.insertAuditLog({
    eventCode: 'DIR-PROVISION',
    actorId: b.created_by || 'CIAM-HUB',
    ipAddress: getCiamOriginIp(req, { verifiedCiamFlow: true }),
    targetResource: `users/${id}`,
    details: {
      username,
      role: record.role,
      use_ad_auth: record.use_ad_auth,
      is_active: record.active,
      client_ip: getClientIp(req)
    }
  });
  res.status(existing ? 200 : 201).json({
    success: true,
    status: existing ? 'updated' : 'created',
    id,
    username,
    account: formatDirectoryAccount(record)
  });
});

router.put('/api/v1/directory/accounts/:id', verifyCiamManagementAuth, async (req, res) => {
  const users = await db.getCollection('users');
  const existing = findUserFlexible(users, req.params.id);
  if (!existing) return res.status(404).json({ error: 'account_not_found' });

  const b = req.body || {};
  if (
    typeof b.is_active === 'boolean' &&
    b.is_active !== (existing.active !== false) &&
    existing.is_status_locked === true &&
    !b.force_override
  ) {
    return res.status(409).json({
      error: 'status_locked',
      message: 'บัญชีนี้ถูกล็อคสิทธิ์เด็ดขาดโดย Central IAM (is_status_locked: true)'
    });
  }

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

  const nextRole = b.role || b.group_name ? resolveRoleKeyFromCiam(b.role, b.group_name, existing.role) : existing.role;
  const updated = await db.updateDoc(
    'users',
    existing.id,
    {
      ...(b.full_name || b.name ? { name: b.full_name || b.name } : {}),
      ...(b.username ? { username: b.username } : {}),
      ...(b.department ? { department: b.department } : {}),
      ...(b.email ? { email: b.email } : {}),
      ...(b.role || b.group_name ? { role: nextRole, group_name: b.group_name || ROLE_DEF[nextRole]?.l || nextRole } : {}),
      ...(typeof b.use_ad_auth === 'boolean' ? { use_ad_auth: b.use_ad_auth } : {}),
      ...(typeof b.is_status_locked === 'boolean' ? { is_status_locked: b.is_status_locked } : {}),
      active: nextActive,
      is_active: nextActive,
      status_origin: nextOrigin,
      updatedAt: new Date().toISOString()
    },
    'ciam-push'
  );
  if (!nextActive) {
    await revokeUserSessions(existing);
  }
  res.json({ status: 'updated', account: formatDirectoryAccount(updated) });
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
    const existing = findUserFlexible(users, targetUsername);

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
        ipAddress: getCiamOriginIp(req, { verifiedCiamFlow: true }),
        targetResource: `users/${existing.id}`,
        details: {
          reason: 'account_status_locked_by_central_authority',
          requested_active: is_active,
          client_ip: getClientIp(req)
        }
      });
      return res.status(409).json({
        error: 'status_locked',
        message: 'บัญชีนี้ถูกล็อคสิทธิ์เด็ดขาดโดย Central IAM (is_status_locked: true) ไม่สามารถแก้ไขได้'
      });
    }

    await db.updateDoc(
      'users',
      existing.id,
      {
        active: is_active,
        is_active: is_active,
        status_origin: 'CIAM',
        status_updated_at: new Date().toISOString()
      },
      'ciam-patch'
    );

    // If account deactivated, revoke all active sessions immediately (Spec C.3 & SSO-04)
    if (!is_active) {
      await revokeUserSessions(existing);
    }

    await db.insertAuditLog({
      eventCode: is_active ? 'DIR-REACTIVATE' : 'SSO-04',
      actorId: 'CIAM-HUB',
      actorEmail: existing.email || '',
      actorRole: existing.role,
      ipAddress: getCiamOriginIp(req, { verifiedCiamFlow: true }),
      targetResource: `users/${existing.id}`,
      details: {
        action: is_active ? 'account_reactivated' : '1_click_offboard',
        reason: reason || '1-Click Offboarding via Central Identity Management',
        is_active,
        client_ip: getClientIp(req)
      }
    });

    res.json({
      username: existing.username || existing.id,
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
    const s = await db.getSystemSettings();
    let users = await db.getCollection('users');

    let syncMode = 'local-inventory';
    let provisionedCount = 0;
    let updatedCount = 0;
    let remoteError = '';

    const apiKey = s.ciam_management_api_key || s.ciam_client_secret || '';
    if (s.ciam_enabled === 'true' && apiKey && s.ciam_issuer_url) {
      const baseIssuer = String(s.ciam_issuer_url).replace(/\/+$/, '');
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      try {
        const resp = await fetch(`${baseIssuer}/api/v1/agent/heartbeat`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            'X-Spoke-Client-ID': s.ciam_client_id || 'apex-spoke-client',
            'X-Spoke-API-Key': apiKey,
            'X-Request-Timestamp': String(Math.floor(Date.now() / 1000))
          },
          body: JSON.stringify({
            app_code: s.app_code || 'apex',
            status: 'HEALTHY',
            sync_type: 'FULL_SYNC',
            accounts: users.map(formatDirectoryAccount)
          }),
          signal: controller.signal
        });
        clearTimeout(timer);

        if (resp.ok) {
          syncMode = 'remote';
          const payload = await resp.json().catch(() => ({}));
          const assignedList = Array.isArray(payload.assigned_accounts) ? payload.assigned_accounts : [];
          const pendingCommands = Array.isArray(payload.pending_commands) ? payload.pending_commands : [];

          const fallbackRole = resolveRoleKeyFromCiam(s.ciam_auto_provision_group, null, 'viewer');

          for (const acct of assignedList) {
            const uname = String(acct.username || acct.external_id || '').trim();
            if (!uname) continue;
            const found = findUserFlexible(users, uname || acct.email);
            if (!found) {
              const rKey = resolveRoleKeyFromCiam(acct.role, acct.group_name, fallbackRole);
              const isExt = ['contractor', 'customer'].includes(rKey);
              const newDoc = {
                id: uname,
                uid: uname,
                username: uname,
                external_id: uname,
                name: acct.full_name || acct.name || uname,
                department: acct.department || '',
                title: acct.department || 'พนักงาน (Central IAM)',
                email: acct.email || '',
                role: rKey,
                kind: isExt ? 'external' : 'internal',
                use_ad_auth: acct.use_ad_auth ?? !isExt,
                active: acct.is_active !== false,
                is_active: acct.is_active !== false,
                status_origin: 'CIAM',
                projects: rKey === 'admin' ? 'all' : [],
                grant: [],
                deny: [],
                createdAt: nowIso
              };
              await db.setDoc('users', uname, newDoc, 'ciam-sync');
              users.push(newDoc);
              provisionedCount++;
            }
          }

          for (const cmd of pendingCommands) {
            const uname = String(cmd.username || '').trim();
            const action = String(cmd.action || '').toUpperCase();
            if (!uname || uname === 'ALL_ACCOUNTS') continue;
            const target = findUserFlexible(users, uname);
            if (action === 'DISABLE_USER' && target && target.id !== 'U01' && !target.is_status_locked) {
              if (target.active !== false) {
                await db.updateDoc(
                  'users',
                  target.id,
                  { active: false, is_active: false, status_origin: 'CIAM', status_updated_at: nowIso },
                  'ciam-sync'
                );
                await revokeUserSessions(target);
                updatedCount++;
              }
            } else if (action === 'ENABLE_USER' && target && !target.is_status_locked) {
              if (target.active === false && target.status_origin !== 'LOCAL') {
                await db.updateDoc(
                  'users',
                  target.id,
                  { active: true, is_active: true, status_origin: 'CIAM', status_updated_at: nowIso },
                  'ciam-sync'
                );
                updatedCount++;
              }
            }
          }
          users = await db.getCollection('users');
        } else {
          remoteError = `HTTP ${resp.status}`;
        }
      } catch (netErr) {
        clearTimeout(timer);
        remoteError = netErr.message;
      }
    }

    await db.updateSystemSettings({ last_directory_sync_at: nowIso }, req.apexUser.id);

    await db.insertAuditLog({
      eventCode: 'SYNC-01',
      actorId: req.apexUser.id,
      actorEmail: req.apexUser.email,
      actorRole: req.apexUser.role,
      ipAddress: getClientIp(req),
      targetResource: 'ciam_directory_sync',
      details: {
        mode: syncMode,
        synced_accounts: users.length,
        provisioned: provisionedCount,
        updated: updatedCount,
        ...(remoteError ? { remote_note: remoteError } : {}),
        synced_at: nowIso
      }
    });

    const msg =
      syncMode === 'remote'
        ? `ซิงค์ข้อมูลกับ Central IAM สำเร็จ (${users.length} บัญชี · สร้างใหม่ ${provisionedCount} · ปรับสถานะ ${updatedCount})`
        : `บันทึกการตรวจสอบบัญชีผู้ใช้ในระบบ (${users.length} บัญชี)${remoteError ? ` — หมายเหตุ CIAM: ${remoteError}` : ''}`;

    res.json({
      status: 'ok',
      mode: syncMode,
      synced_accounts: users.length,
      provisioned: provisionedCount,
      updated: updatedCount,
      synced_at: nowIso,
      message: msg
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
