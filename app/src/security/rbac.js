/**
 * APEX (apex.windowasia.com) - Track A: RBAC Engine (10 Roles x 37 Permissions + EXT_DENY)
 * Enforces Window Asia Central IAM v2.9.0 & ISO/IEC 27001:2022 A.5.15 / A.5.18 Access Control
 */
const db = require('../db/postgres');

const PKEYS = [
  // Group 1: การขาย / เสนองาน
  'view.bid', 'bid.edit', 'bid.win',
  // Group 2: ภาพรวมและโครงการ
  'view.port', 'view.proj', 'proj.edit', 'proj.assign', 'plan.edit',
  // Group 3: ขั้นตอนหน้างาน (S1-S8 & NCR)
  's12', 's3', 's4', 's5', 's5acc', 'qc', 'ho', 'close', 'ncr',
  // Group 4: ทีมช่างและการเบิกจ่าย
  'view.team', 'team.edit', 'claim.submit', 'claim.approve', 'claim.pay', 'retcert',
  // Group 5: รายงานหน้างาน
  'view.daily', 'daily.edit', 'daily.ack', 'view.issues', 'issues.edit', 'hours.edit',
  // Group 6: การเงินและบัญชี
  'fin', 'cost.edit', 'view.poc', 'view.cash', 'bill', 'recv',
  // Group 7: ระบบ
  'view.forms', 'users'
];

const RV = ['view.port', 'view.proj', 'view.team', 'view.daily', 'view.issues', 'view.forms'];

const ROLE_DEF = {
  admin: { l: 'ผู้ดูแลระบบ', keys: PKEYS },
  exec: {
    l: 'ผู้บริหาร',
    keys: [...RV, 'view.bid', 'bid.win', 'view.poc', 'view.cash', 'fin', 'plan.edit', 'claim.approve', 'ho', 'close', 'daily.ack', 'retcert']
  },
  pm: {
    l: 'ผู้จัดการโครงการ',
    keys: [...RV, 'view.bid', 'hours.edit', 'proj.edit', 'proj.assign', 'plan.edit', 's12', 's3', 's4', 's5', 's5acc', 'qc', 'ho', 'close', 'ncr', 'team.edit', 'claim.approve', 'daily.edit', 'daily.ack', 'issues.edit']
  },
  qc: {
    l: 'วิศวกร / QC',
    keys: ['view.proj', 'view.daily', 'view.issues', 'view.forms', 's12', 's3', 's5acc', 'qc', 'ncr', 'daily.edit', 'issues.edit']
  },
  foreman: {
    l: 'โฟร์แมน',
    keys: ['view.proj', 'view.daily', 'view.issues', 'view.forms', 'view.team', 's12', 's4', 's5', 's5acc', 'ncr', 'daily.edit', 'issues.edit', 'hours.edit']
  },
  sales: {
    l: 'ฝ่ายขาย / ประมาณราคา',
    keys: ['view.bid', 'bid.edit', 'bid.win', 'view.port', 'view.proj', 'view.forms', 'proj.edit']
  },
  acct: {
    l: 'บัญชี / การเงิน',
    keys: ['view.bid', 'view.port', 'view.proj', 'view.team', 'view.poc', 'view.cash', 'view.forms', 'fin', 'cost.edit', 'claim.pay', 'retcert', 'bill', 'recv']
  },
  contractor: {
    l: 'ผู้รับเหมา (ทีมช่าง)',
    keys: ['view.proj', 'view.team', 'view.forms', 's4', 's5', 'claim.submit']
  },
  customer: {
    l: 'ลูกค้า / ผู้ควบคุมงาน',
    keys: ['view.proj', 'view.forms']
  },
  viewer: {
    l: 'ดูอย่างเดียว',
    keys: ['view.port', 'view.proj']
  }
};

// Hard-Deny 17 sensitive internal/financial/admin permissions for external users
const EXT_DENY = [
  'fin', 'users', 'cost.edit', 'view.poc', 'view.cash', 'bill', 'recv',
  'claim.approve', 'claim.pay', 'retcert', 'view.bid', 'bid.edit',
  'bid.win', 'team.edit', 'view.port', 'proj.edit', 'hours.edit'
];

// Active SSO sessions in memory
const ssoSessions = new Map();

function parseCookies(cookieHeader = '') {
  const out = {};
  cookieHeader.split(';').forEach(pair => {
    const idx = pair.indexOf('=');
    if (idx > 0) {
      const k = pair.slice(0, idx).trim();
      const v = pair.slice(idx + 1).trim();
      out[k] = decodeURIComponent(v);
    }
  });
  return out;
}

function computeEffectivePermissions(userRecord, customRoles = []) {
  const roleKey = userRecord?.role || 'admin';
  const customRole = customRoles.find(r => (r.key || r.id) === roleKey);
  const baseKeys =
    roleKey === 'admin'
      ? PKEYS
      : Array.isArray(customRole?.keys)
        ? customRole.keys
        : ROLE_DEF[roleKey]?.keys || [];

  const set = new Set(baseKeys);
  if (userRecord) {
    (userRecord.grant || []).forEach(k => set.add(k));
    (userRecord.deny || []).forEach(k => set.delete(k));
    const kind =
      userRecord.kind ||
      (['contractor', 'customer'].includes(userRecord.role) ? 'external' : 'internal');
    if (kind === 'external' || userRecord.is_external === true) {
      EXT_DENY.forEach(k => set.delete(k));
    }
  }
  if (roleKey === 'admin') {
    PKEYS.forEach(k => set.add(k));
  }
  return Array.from(set);
}

/**
 * Resolves the current user from:
 * 1. Central IAM SSO Session Cookie (`apex_session`)
 * 2. IT Security Gateway Headers (`X-User-ID`, `X-User-Email`, `X-User-Role`, `X-User-Department`)
 * 3. Fallback default admin (`U01`) in local development
 */
async function resolveRequestUser(req, res, next) {
  try {
    const cookies = parseCookies(req.headers.cookie || '');
    const sessionToken = cookies.apex_session;
    const sessionData = sessionToken ? ssoSessions.get(sessionToken) : null;

    const gatewayUserId = req.headers['x-user-id'] || '';
    const gatewayEmail = req.headers['x-user-email'] || '';
    const gatewayRole = req.headers['x-user-role'] || '';
    const gatewayDept = req.headers['x-user-department'] || '';

    const users = await db.getCollection('users');
    const roles = await db.getCollection('roles');

    let matchedUser = null;
    let isAuthenticated = false;
    if (sessionData) {
      isAuthenticated = true;
      matchedUser = users.find(
        u =>
          u.id === sessionData.userId ||
          u.uid === sessionData.uid ||
          (u.email && u.email.toLowerCase() === (sessionData.email || '').toLowerCase())
      );
    } else if (gatewayUserId || gatewayEmail) {
      isAuthenticated = true;
      matchedUser = users.find(
        u =>
          u.uid === gatewayUserId ||
          u.id === gatewayUserId ||
          (gatewayEmail && u.email && u.email.toLowerCase() === gatewayEmail.toLowerCase())
      );
      if (!matchedUser && users.length > 0) {
        // Map starter-kit default header EMP-1001 to primary admin U01 so local dev works out of the box
        matchedUser = users.find(u => u.id === 'U01') || users[0];
      }
    } else if (users.length > 0) {
      matchedUser = users.find(u => u.id === 'U01') || users[0];
    }

    // Support "Act As" role testing header from frontend when real user is admin
    const actAsId = req.headers['x-act-as-user'] || '';
    let effectiveUser = matchedUser;
    if (actAsId && (!matchedUser || matchedUser.role === 'admin')) {
      const target = users.find(u => u.id === actAsId);
      if (target) effectiveUser = target;
    }

    const perms = computeEffectivePermissions(effectiveUser, roles);
    const canWrite = perms.some(k => !k.startsWith('view.') && k !== 'fin');
    const canFin = perms.includes('fin');

    req.apexAuthenticated = isAuthenticated;
    req.apexUser = {
      id: effectiveUser?.id || gatewayUserId || 'U01',
      uid: effectiveUser?.uid || effectiveUser?.id || gatewayUserId || 'U01',
      name: effectiveUser?.name || 'ผู้ดูแลระบบ (IT Gateway)',
      email: effectiveUser?.email || gatewayEmail || 'u01@windowasia.co.th',
      role: effectiveUser?.role || 'admin',
      department: gatewayDept || effectiveUser?.title || 'Operations',
      active: effectiveUser ? effectiveUser.active !== false : true,
      kind:
        effectiveUser?.kind ||
        (['contractor', 'customer'].includes(effectiveUser?.role) ? 'external' : 'internal'),
      use_ad_auth: effectiveUser?.use_ad_auth ?? !['contractor', 'customer'].includes(effectiveUser?.role),
      projects: effectiveUser?.projects || 'all',
      team: effectiveUser?.team || '',
      permissions: perms,
      canWrite,
      canFin,
      authenticated: isAuthenticated,
      realUserId: matchedUser?.id || 'U01'
    };

    next();
  } catch (err) {
    next(err);
  }
}

module.exports = {
  PKEYS,
  ROLE_DEF,
  EXT_DENY,
  ssoSessions,
  parseCookies,
  computeEffectivePermissions,
  resolveRequestUser
};
