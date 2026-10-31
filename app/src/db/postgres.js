/**
 * APEX (apex.windowasia.com) - Database Layer (PostgreSQL + Local Fallback)
 * Enforces Zero .env Dependency for CIAM/AI Settings (`system_settings` table)
 * and ISO/IEC 27001:2022 Audit Logging (`transaction_logs` table).
 */
const { Pool } = require('pg');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

function hashPassword(plainText) {
  const salt = crypto.randomBytes(16).toString('hex');
  const iterations = 100000;
  const derived = crypto.pbkdf2Sync(String(plainText), salt, iterations, 32, 'sha256').toString('hex');
  return `pbkdf2_sha256$${iterations}$${salt}$${derived}`;
}

function verifyPassword(plainText, storedHash) {
  if (!plainText || !storedHash || typeof storedHash !== 'string') return false;
  const parts = storedHash.split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2_sha256') return false;
  const iterations = parseInt(parts[1], 10);
  const salt = parts[2];
  const expectedHex = parts[3];
  if (!iterations || !salt || !expectedHex) return false;
  const actualBuf = crypto.pbkdf2Sync(String(plainText), salt, iterations, 32, 'sha256');
  const expectedBuf = Buffer.from(expectedHex, 'hex');
  if (actualBuf.length !== expectedBuf.length) return false;
  return crypto.timingSafeEqual(actualBuf, expectedBuf);
}

/**
 * Safely migrates legacy plaintext `admin_local_password` to `admin_password_hash`
 * without ever overwriting a previously configured admin password with a source default,
 * and initializes `admin_password_hash` from `APEX_INITIAL_ADMIN_PASSWORD` only if none is set.
 */
function reconcileAdminPasswordSettings(settingsObj = {}, envInitialPassword = process.env.APEX_INITIAL_ADMIN_PASSWORD) {
  const legacyPlain = typeof settingsObj.admin_local_password === 'string'
    ? settingsObj.admin_local_password.trim()
    : '';
  const existingHash = typeof settingsObj.admin_password_hash === 'string'
    ? settingsObj.admin_password_hash.trim()
    : '';
  const envPass = typeof envInitialPassword === 'string' ? envInitialPassword.trim() : '';

  if (legacyPlain) {
    return {
      admin_password_hash: hashPassword(legacyPlain),
      migratedFromLegacy: true,
      removeLegacyKey: true
    };
  }

  if (existingHash && existingHash.startsWith('pbkdf2_sha256$')) {
    return {
      admin_password_hash: existingHash,
      migratedFromLegacy: false,
      removeLegacyKey: Boolean('admin_local_password' in settingsObj)
    };
  }

  if (envPass) {
    return {
      admin_password_hash: hashPassword(envPass),
      migratedFromLegacy: false,
      removeLegacyKey: Boolean('admin_local_password' in settingsObj)
    };
  }

  return {
    admin_password_hash: '',
    migratedFromLegacy: false,
    removeLegacyKey: Boolean('admin_local_password' in settingsObj)
  };
}

const VALID_COLLECTIONS = new Set([
  'openings', 'ncrs', 'teams', 'projects', 'customers', 'sales',
  'materials', 'labor', 'budgets', 'others', 'drawings', 'issues',
  'dailies', 'engagements', 'claims', 'cinvoices', 'handovers',
  'users', 'roles', 'timesheets', 'bids', 'settings', 'assets'
]);

const DEFAULT_SYSTEM_SETTINGS = {
  app_code: 'apex',
  app_domain: 'https://apex.windowasia.com',
  ciam_enabled: 'false',
  ciam_issuer_url: 'https://ciam.windowasia.com',
  ciam_client_id: 'apex-spoke-client',
  ciam_client_secret: '',
  ciam_redirect_uri: 'https://apex.windowasia.com/api/auth/sso/callback',
  ciam_post_logout_redirect_uri: 'https://apex.windowasia.com/auth/start',
  ciam_management_api_key: '',
  ciam_allowed_ips: '157.173.219.153,127.0.0.1,::1',
  break_glass_enabled: 'false',
  break_glass_url: 'http://172.18.0.1:3100',
  ai_copilot_enabled: 'true',
  ai_provider_url: 'https://api.openai.com/v1/chat/completions',
  ai_api_key: '',
  ai_model_name: 'gpt-4o-mini',
  admin_password_hash: '',
  require_login: 'true',
  last_directory_sync_at: ''
};

const connectionString =
  process.env.DATABASE_URL ||
  'postgresql://apex:apex_password@postgres:5432/apex';

let pool = null;
let usePostgres = false;
const fallbackFile = path.join(__dirname, '..', '..', 'data', 'local-store.json');

let memoryStore = {
  collections: {},
  system_settings: { ...DEFAULT_SYSTEM_SETTINGS },
  transaction_logs: []
};

function loadFallbackStore() {
  try {
    if (fs.existsSync(fallbackFile)) {
      const raw = JSON.parse(fs.readFileSync(fallbackFile, 'utf8'));
      memoryStore.collections = raw.collections || {};
      memoryStore.system_settings = { ...DEFAULT_SYSTEM_SETTINGS, ...(raw.system_settings || {}) };
      memoryStore.transaction_logs = raw.transaction_logs || [];
    }
    const reconciled = reconcileAdminPasswordSettings(memoryStore.system_settings);
    memoryStore.system_settings.admin_password_hash = reconciled.admin_password_hash;
    delete memoryStore.system_settings.admin_local_password;
  } catch (err) {
    console.warn('[DB] Could not load fallback store, starting fresh:', err.message);
  }
}

function saveFallbackStore() {
  try {
    const dir = path.dirname(fallbackFile);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(fallbackFile, JSON.stringify(memoryStore, null, 2), 'utf8');
  } catch (err) {
    console.warn('[DB] Could not write fallback store:', err.message);
  }
}

async function initDatabase() {
  pool = new Pool({
    connectionString,
    connectionTimeoutMillis: 4000,
    max: 20
  });

  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      const client = await pool.connect();
      try {
        await client.query(`
          CREATE TABLE IF NOT EXISTS apex_documents (
            collection VARCHAR(64) NOT NULL,
            doc_id VARCHAR(191) NOT NULL,
            data JSONB NOT NULL DEFAULT '{}'::jsonb,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_by VARCHAR(128),
            PRIMARY KEY (collection, doc_id)
          );
          CREATE INDEX IF NOT EXISTS idx_apex_docs_collection ON apex_documents(collection);

          CREATE TABLE IF NOT EXISTS system_settings (
            setting_key VARCHAR(128) PRIMARY KEY,
            setting_value TEXT NOT NULL DEFAULT '',
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_by VARCHAR(128)
          );

          CREATE TABLE IF NOT EXISTS transaction_logs (
            id SERIAL PRIMARY KEY,
            event_code VARCHAR(32) NOT NULL,
            actor_id VARCHAR(128),
            actor_email VARCHAR(255),
            actor_role VARCHAR(64),
            ip_address VARCHAR(64),
            target_resource VARCHAR(255),
            details JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );
          CREATE INDEX IF NOT EXISTS idx_tx_logs_created_at ON transaction_logs(created_at DESC);
          CREATE INDEX IF NOT EXISTS idx_tx_logs_event_code ON transaction_logs(event_code);
        `);

        for (const [k, v] of Object.entries(DEFAULT_SYSTEM_SETTINGS)) {
          await client.query(
            `INSERT INTO system_settings (setting_key, setting_value, updated_by)
             VALUES ($1, $2, 'system-init')
             ON CONFLICT (setting_key) DO NOTHING`,
            [k, String(v)]
          );
        }

        // Safely migrate legacy admin_local_password or bootstrap from APEX_INITIAL_ADMIN_PASSWORD
        const pwRows = await client.query(
          `SELECT setting_key, setting_value FROM system_settings
           WHERE setting_key IN ('admin_local_password', 'admin_password_hash')`
        );
        const pwMap = {};
        for (const r of pwRows.rows) pwMap[r.setting_key] = r.setting_value;
        const reconciled = reconcileAdminPasswordSettings(pwMap);
        if (reconciled.admin_password_hash) {
          await client.query(
            `INSERT INTO system_settings (setting_key, setting_value, updated_by, updated_at)
             VALUES ('admin_password_hash', $1, 'system-migration', NOW())
             ON CONFLICT (setting_key) DO UPDATE SET
               setting_value = EXCLUDED.setting_value,
               updated_by = 'system-migration',
               updated_at = NOW()`,
            [reconciled.admin_password_hash]
          );
        }
        if (reconciled.removeLegacyKey) {
          await client.query(`DELETE FROM system_settings WHERE setting_key = 'admin_local_password'`);
        }

        // Ensure bootstrap primary admin U01 exists so initial login works before full dataset seed
        await client.query(
          `INSERT INTO apex_documents (collection, doc_id, data, updated_by)
           VALUES ('users', 'U01', $1::jsonb, 'system-init')
           ON CONFLICT (collection, doc_id) DO NOTHING`,
          [
            JSON.stringify({
              id: 'U01',
              uid: 'U01',
              name: 'คุณปฏินันท์',
              title: 'ผู้ดูแลระบบ (IT Security)',
              email: 'u01@windowasia.co.th',
              role: 'admin',
              kind: 'internal',
              use_ad_auth: true,
              active: true,
              projects: 'all',
              grant: [],
              deny: []
            })
          ]
        );
        usePostgres = true;
        console.log('[DB] Connected to PostgreSQL (dept-db) and verified schema.');
        return true;
      } finally {
        client.release();
      }
    } catch (err) {
      console.warn(`[DB] PostgreSQL connection attempt ${attempt}/5 failed: ${err.message}`);
      await new Promise(r => setTimeout(r, 1200));
    }
  }

  console.warn('[DB] Falling back to local persistent JSON store (app/data/local-store.json).');
  loadFallbackStore();
  if (!memoryStore.collections.users || !memoryStore.collections.users.U01) {
    if (!memoryStore.collections.users) memoryStore.collections.users = {};
    memoryStore.collections.users.U01 = {
      id: 'U01',
      uid: 'U01',
      name: 'คุณปฏินันท์',
      title: 'ผู้ดูแลระบบ (IT Security)',
      email: 'u01@windowasia.co.th',
      role: 'admin',
      kind: 'internal',
      use_ad_auth: true,
      active: true,
      projects: 'all',
      grant: [],
      deny: []
    };
  }
  return false;
}

// --- Collection CRUD Operations ---

async function getCollection(collection) {
  if (!VALID_COLLECTIONS.has(collection)) {
    throw new Error(`Invalid collection: ${collection}`);
  }
  if (usePostgres) {
    const res = await pool.query(
      'SELECT doc_id, data FROM apex_documents WHERE collection = $1 ORDER BY doc_id ASC',
      [collection]
    );
    return res.rows.map(r => ({ id: r.doc_id, ...r.data }));
  }
  const col = memoryStore.collections[collection] || {};
  return Object.entries(col).map(([id, data]) => ({ id, ...data }));
}

async function getAllCollectionsSnapshot() {
  const result = {};
  for (const col of VALID_COLLECTIONS) {
    if (col === 'assets') continue;
    result[col] = [];
  }
  if (usePostgres) {
    const res = await pool.query(
      "SELECT collection, doc_id, data FROM apex_documents WHERE collection <> 'assets'"
    );
    for (const row of res.rows) {
      if (!result[row.collection]) result[row.collection] = [];
      result[row.collection].push({ id: row.doc_id, ...row.data });
    }
    return result;
  }
  for (const col of Object.keys(result)) {
    const map = memoryStore.collections[col] || {};
    result[col] = Object.entries(map).map(([id, data]) => ({ id, ...data }));
  }
  return result;
}

async function getDoc(collection, docId) {
  if (!VALID_COLLECTIONS.has(collection)) {
    throw new Error(`Invalid collection: ${collection}`);
  }
  if (usePostgres) {
    const res = await pool.query(
      'SELECT doc_id, data FROM apex_documents WHERE collection = $1 AND doc_id = $2',
      [collection, String(docId)]
    );
    if (!res.rows.length) return null;
    return { id: res.rows[0].doc_id, ...res.rows[0].data };
  }
  const col = memoryStore.collections[collection] || {};
  const d = col[String(docId)];
  return d ? { id: String(docId), ...d } : null;
}

async function setDoc(collection, docId, data, actorId = 'system') {
  if (!VALID_COLLECTIONS.has(collection)) {
    throw new Error(`Invalid collection: ${collection}`);
  }
  const id = String(docId);
  const payload = { ...data, id };
  if (usePostgres) {
    await pool.query(
      `INSERT INTO apex_documents (collection, doc_id, data, updated_at, updated_by)
       VALUES ($1, $2, $3::jsonb, NOW(), $4)
       ON CONFLICT (collection, doc_id)
       DO UPDATE SET data = $3::jsonb, updated_at = NOW(), updated_by = $4`,
      [collection, id, JSON.stringify(payload), actorId]
    );
  } else {
    if (!memoryStore.collections[collection]) memoryStore.collections[collection] = {};
    memoryStore.collections[collection][id] = payload;
    saveFallbackStore();
  }
  return payload;
}

async function updateDoc(collection, docId, patch, actorId = 'system') {
  if (!VALID_COLLECTIONS.has(collection)) {
    throw new Error(`Invalid collection: ${collection}`);
  }
  const id = String(docId);
  const existing = (await getDoc(collection, id)) || { id };
  const merged = { ...existing, ...patch, id };
  return setDoc(collection, id, merged, actorId);
}

async function deleteDoc(collection, docId) {
  if (!VALID_COLLECTIONS.has(collection)) {
    throw new Error(`Invalid collection: ${collection}`);
  }
  const id = String(docId);
  if (usePostgres) {
    await pool.query(
      'DELETE FROM apex_documents WHERE collection = $1 AND doc_id = $2',
      [collection, id]
    );
  } else {
    if (memoryStore.collections[collection]) {
      delete memoryStore.collections[collection][id];
      saveFallbackStore();
    }
  }
  return true;
}

// --- System Settings (Zero .env Dependency) ---

async function getSystemSettings() {
  if (usePostgres) {
    const res = await pool.query('SELECT setting_key, setting_value FROM system_settings');
    const out = { ...DEFAULT_SYSTEM_SETTINGS };
    for (const r of res.rows) out[r.setting_key] = r.setting_value;
    return out;
  }
  return { ...DEFAULT_SYSTEM_SETTINGS, ...memoryStore.system_settings };
}

async function updateSystemSettings(updates, actorId = 'admin') {
  if (usePostgres) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const [k, v] of Object.entries(updates)) {
        if (!(k in DEFAULT_SYSTEM_SETTINGS)) continue;
        await client.query(
          `INSERT INTO system_settings (setting_key, setting_value, updated_at, updated_by)
           VALUES ($1, $2, NOW(), $3)
           ON CONFLICT (setting_key)
           DO UPDATE SET setting_value = $2, updated_at = NOW(), updated_by = $3`,
          [k, String(v ?? ''), actorId]
        );
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } else {
    for (const [k, v] of Object.entries(updates)) {
      if (k in DEFAULT_SYSTEM_SETTINGS) {
        memoryStore.system_settings[k] = String(v ?? '');
      }
    }
    saveFallbackStore();
  }
  return getSystemSettings();
}

// --- Transaction Audit Logs (ISO/IEC 27001:2022 A.8.15) ---

async function insertAuditLog({
  eventCode,
  actorId = 'anonymous',
  actorEmail = '',
  actorRole = '',
  ipAddress = '',
  targetResource = '',
  details = {}
}) {
  if (usePostgres) {
    await pool.query(
      `INSERT INTO transaction_logs
       (event_code, actor_id, actor_email, actor_role, ip_address, target_resource, details, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, NOW())`,
      [
        eventCode,
        actorId,
        actorEmail,
        actorRole,
        ipAddress,
        targetResource,
        JSON.stringify(details || {})
      ]
    );
  } else {
    memoryStore.transaction_logs.unshift({
      id: memoryStore.transaction_logs.length + 1,
      event_code: eventCode,
      actor_id: actorId,
      actor_email: actorEmail,
      actor_role: actorRole,
      ip_address: ipAddress,
      target_resource: targetResource,
      details,
      created_at: new Date().toISOString()
    });
    memoryStore.transaction_logs = memoryStore.transaction_logs.slice(0, 500);
    saveFallbackStore();
  }
}

async function getAuditLogs(limit = 100) {
  const safeLimit = Math.min(Math.max(1, Number(limit) || 100), 500);
  if (usePostgres) {
    const res = await pool.query(
      `SELECT id, event_code, actor_id, actor_email, actor_role, ip_address, target_resource, details, created_at
       FROM transaction_logs
       ORDER BY created_at DESC
       LIMIT $1`,
      [safeLimit]
    );
    return res.rows;
  }
  return memoryStore.transaction_logs.slice(0, safeLimit);
}

function isUsingPostgres() {
  return usePostgres;
}

module.exports = {
  VALID_COLLECTIONS,
  DEFAULT_SYSTEM_SETTINGS,
  hashPassword,
  verifyPassword,
  reconcileAdminPasswordSettings,
  initDatabase,
  isUsingPostgres,
  getCollection,
  getAllCollectionsSnapshot,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  getSystemSettings,
  updateSystemSettings,
  insertAuditLog,
  getAuditLogs
};
