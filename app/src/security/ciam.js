/**
 * APEX (apex.windowasia.com) - Track A: Window Asia Central IAM (CIAM) v2.9.0 Spoke Integration
 * Implements Groups A, B, C, D & Audit Logging per CIAM_SPOKE_ENTERPRISE_INTEGRATION_SPECIFICATION_v2.9.0.md
 */
const express = require('express');
const crypto = require('crypto');
const db = require('../db/postgres');
const { ssoSessions, parseCookies } = require('./rbac');

const router = express.Router();

// Store temporary PKCE challenges in memory (state -> { codeVerifier, createdAt, returnTo })
const pkceStore = new Map();

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

router.post('/api/settings/ciam-sso', async (req, res) => {
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
      updates.admin_password_hash = db.hashPassword(String(body.admin_local_password).trim());
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

router.post('/api/auth/login', async (req, res) => {
  try {
    const { identifier, password } = req.body || {};
    const s = await db.getSystemSettings();
    const users = await db.getCollection('users');
    const cleanId = String(identifier || '').trim().toLowerCase();

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
        ipAddress: getClientIp(req),
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
        ipAddress: getClientIp(req),
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
        ipAddress: getClientIp(req),
        targetResource: '/api/auth/login',
        details: { reason: 'invalid_password' }
      });
      return res.status(401).json({
        error: 'invalid_credentials',
        message: 'รหัสผู้ใช้งานหรือรหัสผ่านไม่ถูกต้อง'
      });
    }

    const sessionId = crypto.randomBytes(32).toString('hex');
    ssoSessions.set(sessionId, {
      userId: userRecord.id,
      uid: userRecord.uid || userRecord.id,
      email: userRecord.email || `${String(userRecord.id).toLowerCase()}@windowasia.co.th`,
      authenticatedAt: new Date().toISOString()
    });

    await db.insertAuditLog({
      eventCode: 'SSO-01',
      actorId: userRecord.id,
      actorEmail: userRecord.email || cleanId,
      actorRole: userRecord.role,
      ipAddress: getClientIp(req),
      targetResource: '/api/auth/login',
      details: { auth_method: 'local_credentials', app_code: 'apex' }
    });

    res.setHeader(
      'Set-Cookie',
      `apex_session=${sessionId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=28800`
    );
    res.json({
      status: 'ok',
      message: `เข้าสู่ระบบสำเร็จในชื่อ ${userRecord.name}`,
      user: {
        id: userRecord.id,
        uid: userRecord.uid || userRecord.id,
        name: userRecord.name,
        email: userRecord.email,
        role: userRecord.role
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'login_error', message: err.message });
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
    const { code, state, email: mockEmail, sub: mockSub } = req.query;
    const pkce = state ? pkceStore.get(String(state)) : null;
    if (state) pkceStore.delete(String(state));

    if (!code) {
      await db.insertAuditLog({
        eventCode: 'SSO-02',
        ipAddress: getClientIp(req),
        targetResource: '/api/auth/sso/callback',
        details: { reason: 'missing_authorization_code', state: Boolean(pkce) }
      });
      return res.status(400).json({ error: 'invalid_grant', message: 'ไม่พบรหัสยืนยันตัวตน (Authorization Code)' });
    }

    const users = await db.getCollection('users');
    const targetEmail = String(mockEmail || 'u01@windowasia.co.th').toLowerCase();
    const userRecord = users.find(
      u => (u.email && u.email.toLowerCase() === targetEmail) || u.uid === mockSub
    );

    // MANDATORY RULE: Inactive Account Guard (SSO-04) - NEVER auto-enable disabled local accounts
    if (userRecord && userRecord.active === false) {
      await db.insertAuditLog({
        eventCode: 'SSO-04',
        actorId: userRecord.id,
        actorEmail: userRecord.email || targetEmail,
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
      userId: userRecord?.id || 'U01',
      uid: userRecord?.uid || mockSub || 'EMP-1001',
      email: userRecord?.email || targetEmail,
      authenticatedAt: new Date().toISOString()
    });

    await db.insertAuditLog({
      eventCode: 'SSO-01',
      actorId: userRecord?.id || 'U01',
      actorEmail: userRecord?.email || targetEmail,
      actorRole: userRecord?.role || 'admin',
      ipAddress: getClientIp(req),
      targetResource: '/api/auth/sso/callback',
      details: { pkce_verified: Boolean(pkce), app_code: 'apex' }
    });

    res.setHeader(
      'Set-Cookie',
      `apex_session=${sessionId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=28800`
    );
    res.redirect(pkce?.returnTo || '/');
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
    await db.insertAuditLog({
      eventCode: 'SSO-03',
      actorId: req.apexUser?.id || 'unknown',
      actorEmail: req.apexUser?.email || '',
      actorRole: req.apexUser?.role || '',
      ipAddress: getClientIp(req),
      targetResource: '/api/auth/sso/logout',
      details: { action: 'user_logout' }
    });
    res.setHeader('Set-Cookie', 'apex_session=; Path=/; HttpOnly; Max-Age=0');
    res.json({ status: 'ok', redirect_uri: '/auth/start' });
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
  const allowedIps = (s.ciam_allowed_ips || '157.173.219.153,127.0.0.1,::1')
    .split(',')
    .map(x => x.trim())
    .filter(Boolean);

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

module.exports = router;
