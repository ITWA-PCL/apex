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
 * Resolves the current user ONLY from a verified session or explicitly trusted auth-proxy:
 * 1. Central IAM / Local Auth Session Cookie (`apex_session`)
 * 2. Trusted IT Security Gateway Headers (`X-User-ID`, `X-User-Email`) ONLY when `TRUST_PROXY_AUTH_HEADERS === 'true'`
 * Unauthenticated requests NEVER receive a default user or permissions (`req.apexUser = null`).
 */
async function resolveRequestUser(req, res, next) {
  try {
    const cookies = parseCookies(req.headers.cookie || '');
    const sessionToken = cookies.apex_session;
    const sessionData = sessionToken ? ssoSessions.get(sessionToken) : null;

    const trustGateway = process.env.TRUST_PROXY_AUTH_HEADERS === 'true';
    const gatewayUserId = trustGateway ? req.headers['x-user-id'] || '' : '';
    const gatewayEmail = trustGateway ? req.headers['x-user-email'] || '' : '';
    const gatewayDept = trustGateway ? req.headers['x-user-department'] || '' : '';

    const users = await db.getCollection('users');
    const roles = await db.getCollection('roles');

    let matchedUser = null;
    if (sessionData) {
      matchedUser = users.find(
        u =>
          u.id === sessionData.userId ||
          u.uid === sessionData.uid ||
          (u.email && u.email.toLowerCase() === (sessionData.email || '').toLowerCase())
      );
    } else if (gatewayUserId || gatewayEmail) {
      matchedUser = users.find(
        u =>
          u.uid === gatewayUserId ||
          u.id === gatewayUserId ||
          (gatewayEmail && u.email && u.email.toLowerCase() === gatewayEmail.toLowerCase())
      );
    }

    // Inactive Account Guard (SSO-04): If no matching user or user is disabled, invalidate session
    if (!matchedUser || matchedUser.active === false) {
      if (sessionToken) ssoSessions.delete(sessionToken);
      req.apexAuthenticated = false;
      req.apexUser = null;
      return next();
    }

    // Support "Act As" role testing header from frontend ONLY when real authenticated user is admin
    const actAsId = req.headers['x-act-as-user'] || '';
    let effectiveUser = matchedUser;
    if (actAsId && matchedUser.role === 'admin') {
      const target = users.find(u => u.id === actAsId && u.active !== false);
      if (target) effectiveUser = target;
    }

    const perms = computeEffectivePermissions(effectiveUser, roles);
    const canWrite = perms.some(k => !k.startsWith('view.') && k !== 'fin');
    const canFin = perms.includes('fin');

    req.apexAuthenticated = true;
    req.apexUser = {
      id: effectiveUser.id,
      uid: effectiveUser.uid || effectiveUser.id,
      name: effectiveUser.name || 'ผู้ดูแลระบบ',
      email: effectiveUser.email || gatewayEmail || '',
      role: effectiveUser.role || 'viewer',
      department: gatewayDept || effectiveUser.title || 'Operations',
      active: true,
      kind:
        effectiveUser.kind ||
        (['contractor', 'customer'].includes(effectiveUser.role) ? 'external' : 'internal'),
      use_ad_auth: effectiveUser.use_ad_auth ?? !['contractor', 'customer'].includes(effectiveUser.role),
      projects: effectiveUser.projects || 'all',
      team: effectiveUser.team || '',
      permissions: perms,
      canWrite,
      canFin,
      authenticated: true,
      realUserId: matchedUser.id
    };

    next();
  } catch (err) {
    next(err);
  }
}

const PUBLIC_API_PATHS = new Set([
  '/api/health',
  '/api/auth/session',
  '/api/auth/login',
  '/api/auth/sso/login',
  '/api/auth/sso/callback',
  '/api/auth/sso/logout'
]);

function normalizeApiPath(rawUrl = '') {
  const clean = String(rawUrl || '')
    .split('?')[0]
    .trim()
    .toLowerCase()
    .replace(/\/+/g, '/');
  if (clean.length > 1 && clean.endsWith('/')) {
    return clean.slice(0, -1);
  }
  return clean || '/';
}

function enforceApiAuthentication(req, res, next) {
  const fullPath = normalizeApiPath(req.originalUrl || req.url || req.path || '');
  const subPath = normalizeApiPath(req.path || '');
  const candidate = fullPath.startsWith('/api') ? fullPath : subPath;

  if (candidate !== '/api' && !candidate.startsWith('/api/')) {
    return next();
  }
  if (
    PUBLIC_API_PATHS.has(candidate) ||
    candidate === '/api/v1/directory/accounts' ||
    candidate.startsWith('/api/v1/directory/accounts/')
  ) {
    return next();
  }
  if (!req.apexAuthenticated || !req.apexUser) {
    return res.status(401).json({
      error: 'unauthenticated',
      message: 'กรุณาเข้าสู่ระบบก่อนใช้งาน (Authentication Required)'
    });
  }
  next();
}

// ============================================================================
// Collection-Level Read/Write RBAC, Project/Team Scoping & Secret Scrubbing
// ============================================================================

const COLLECTION_ACCESS_RULES = {
  users: {
    read: ['users'],
    write: ['users']
  },
  roles: {
    read: ['users'],
    write: ['users']
  },
  bids: {
    read: ['view.bid', 'bid.edit', 'bid.win'],
    write: ['bid.edit', 'bid.win']
  },
  sales: {
    read: ['fin', 'cost.edit', 'view.poc', 'view.cash'],
    write: ['cost.edit']
  },
  budgets: {
    read: ['fin', 'cost.edit', 'view.poc', 'view.cash'],
    write: ['cost.edit']
  },
  others: {
    read: ['fin', 'cost.edit', 'view.poc', 'view.cash'],
    write: ['cost.edit']
  },
  cinvoices: {
    read: ['fin', 'bill', 'recv', 'view.cash', 'view.poc'],
    write: ['bill', 'recv']
  },
  labor: {
    read: ['fin', 'cost.edit', 'team.edit', 'view.team'],
    write: ['cost.edit', 'team.edit']
  },
  teams: {
    read: ['view.team', 'team.edit', 'claim.submit', 'claim.approve', 'claim.pay', 'proj.assign'],
    write: ['team.edit']
  },
  engagements: {
    read: ['view.team', 'team.edit', 'claim.submit', 'claim.approve', 'claim.pay', 'retcert', 'fin', 'view.poc'],
    write: ['team.edit', 'retcert']
  },
  claims: {
    read: ['view.team', 'claim.submit', 'claim.approve', 'claim.pay', 'fin', 'view.cash', 'view.poc'],
    write: ['claim.submit', 'claim.approve', 'claim.pay']
  },
  timesheets: {
    read: ['view.team', 'hours.edit', 'view.daily', 'fin'],
    write: ['hours.edit', 'team.edit']
  },
  projects: {
    read: ['view.port', 'view.proj'],
    write: ['proj.edit', 'plan.edit', 'proj.assign', 's12', 'close', 'bid.win']
  },
  customers: {
    read: ['view.port', 'view.proj', 'view.bid'],
    write: ['proj.edit', 'bid.edit', 'bid.win']
  },
  materials: {
    read: ['view.proj', 'view.port', 's4', 'cost.edit'],
    write: ['proj.edit', 'cost.edit', 's4']
  },
  openings: {
    read: ['view.proj', 'view.port'],
    write: ['proj.assign', 'proj.edit', 's12', 's3', 's4', 's5', 's5acc', 'qc', 'ho', 'close']
  },
  drawings: {
    read: ['view.proj', 's3'],
    write: ['s3', 'proj.edit']
  },
  ncrs: {
    read: ['view.proj', 'ncr', 'qc'],
    write: ['ncr', 'qc']
  },
  dailies: {
    read: ['view.daily', 'daily.edit', 'daily.ack'],
    write: ['daily.edit', 'daily.ack']
  },
  issues: {
    read: ['view.issues', 'issues.edit'],
    write: ['issues.edit']
  },
  handovers: {
    read: ['view.proj', 'ho'],
    write: ['ho', 'close']
  },
  settings: {
    read: ['view.port', 'view.proj', 'users'],
    write: ['users', 'proj.edit', 'cost.edit']
  },
  assets: {
    read: ['view.proj', 'view.daily', 'view.issues', 's4', 's5', 'qc', 'ncr', 'ho'],
    write: ['proj.edit', 's3', 's4', 's5', 's5acc', 'qc', 'ncr', 'ho', 'daily.edit', 'issues.edit']
  }
};

const PROJECT_SCOPED_COLLECTIONS = new Set([
  'openings', 'drawings', 'ncrs', 'dailies', 'issues', 'handovers',
  'sales', 'budgets', 'others', 'engagements', 'claims', 'cinvoices', 'timesheets'
]);

const PROJECT_FINANCIAL_FIELDS = [
  'contractValue', 'value', 'budget', 'cost', 'margin', 'soTotal', 'quotedAmt', 'price', 'amount'
];

function hasAnyPerm(user, requiredKeys = []) {
  if (!user || !Array.isArray(user.permissions)) return false;
  if (user.role === 'admin' && user.permissions.includes('users')) return true;
  return requiredKeys.some(k => user.permissions.includes(k));
}

function canReadCollection(collection, user) {
  if (!user) return false;
  const rule = COLLECTION_ACCESS_RULES[collection];
  if (!rule) return false;
  return hasAnyPerm(user, rule.read);
}

function canWriteCollection(collection, user) {
  if (!user) return false;
  const rule = COLLECTION_ACCESS_RULES[collection];
  if (!rule) return false;
  return hasAnyPerm(user, rule.write);
}

function isDocInUserScope(collection, doc, user) {
  if (!user || !doc) return false;
  if (user.role === 'admin' && user.permissions?.includes('users')) return true;

  // User/role scoping
  if (collection === 'users') {
    if (user.permissions?.includes('users')) return true;
    return doc.id === user.id || doc.uid === user.uid;
  }
  if (collection === 'roles') {
    if (user.permissions?.includes('users')) return true;
    return (doc.key || doc.id) === user.role;
  }

  // Project scoping when user.projects is an explicit array of allowed project IDs
  if (Array.isArray(user.projects)) {
    if (collection === 'projects') {
      const pid = doc.id || doc.code;
      if (pid && !user.projects.includes(pid)) return false;
    } else if (PROJECT_SCOPED_COLLECTIONS.has(collection)) {
      const pid = doc.project || doc.projectId || doc.proj;
      if (pid && !user.projects.includes(pid)) return false;
    }
  }

  // Contractor team scoping: contractors only see their own team's claims/engagements/timesheets
  if (user.role === 'contractor' && user.team) {
    if (['claims', 'engagements', 'timesheets'].includes(collection)) {
      if (doc.team && doc.team !== user.team) return false;
    }
    if (collection === 'teams') {
      const tid = doc.id || doc.code;
      if (tid && tid !== user.team) return false;
    }
  }

  return true;
}

function sanitizeDocForResponse(collection, doc, user) {
  if (!doc || typeof doc !== 'object') return doc;
  const clone = { ...doc };
  delete clone.password;
  delete clone.password_hash;
  delete clone.admin_password_hash;
  delete clone.client_secret;

  const canSeeFinance = Boolean(user?.permissions?.includes('fin'));
  if (!canSeeFinance && collection === 'projects') {
    for (const f of PROJECT_FINANCIAL_FIELDS) {
      if (f in clone) delete clone[f];
    }
  }
  return clone;
}

function filterAndSanitizeCollectionForUser(collection, docs = [], user) {
  if (!user || !Array.isArray(docs)) return [];

  // Special handling for `users` collection in bootstrap:
  // If user lacks 'users' admin permission, return ONLY their own sanitized user profile
  if (collection === 'users' && !canReadCollection('users', user)) {
    return docs
      .filter(d => d.id === user.id || d.uid === user.uid)
      .map(d => sanitizeDocForResponse('users', d, user));
  }

  if (!canReadCollection(collection, user)) {
    return [];
  }

  return docs
    .filter(d => isDocInUserScope(collection, d, user))
    .map(d => sanitizeDocForResponse(collection, d, user));
}

module.exports = {
  PKEYS,
  ROLE_DEF,
  EXT_DENY,
  COLLECTION_ACCESS_RULES,
  ssoSessions,
  parseCookies,
  computeEffectivePermissions,
  resolveRequestUser,
  normalizeApiPath,
  enforceApiAuthentication,
  canReadCollection,
  canWriteCollection,
  isDocInUserScope,
  sanitizeDocForResponse,
  filterAndSanitizeCollectionForUser
};
