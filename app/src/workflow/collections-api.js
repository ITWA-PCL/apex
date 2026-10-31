/**
 * APEX (apex.windowasia.com) - Track B (CFO): 22 Collections Real-Time API & SSE Broadcaster
 */
const express = require('express');
const crypto = require('crypto');
const db = require('../db/postgres');
const finance = require('./finance-engine');
const {
  canReadCollection,
  canWriteCollection,
  isDocInUserScope,
  sanitizeDocForResponse,
  filterAndSanitizeCollectionForUser
} = require('../security/rbac');

const router = express.Router();

function isStrictAdmin(user) {
  return Boolean(
    user &&
      user.role === 'admin' &&
      Array.isArray(user.permissions) &&
      user.permissions.includes('users') &&
      user.id === user.realUserId
  );
}

function sanitizeIncomingUserPayload(body = {}, existingDoc = null) {
  const payload = { ...body };
  // Never allow client to inject raw password_hash directly
  delete payload.password_hash;
  delete payload.admin_password_hash;

  // If a plain password is supplied by admin, hash it server-side
  if (typeof payload.password === 'string' && payload.password.trim() !== '') {
    payload.password_hash = db.hashPassword(payload.password.trim());
  } else if (existingDoc && existingDoc.password_hash) {
    payload.password_hash = existingDoc.password_hash;
  }
  delete payload.password;
  return payload;
}

// Connected SSE clients for real-time onSnapshot updates across Desktop & Mobile PWA
const sseClients = new Set();

function broadcastCollectionChange(collection, action, docId) {
  const payload = JSON.stringify({
    type: 'collection_change',
    collection,
    action,
    docId,
    ts: Date.now()
  });
  for (const res of sseClients) {
    try {
      res.write(`data: ${payload}\n\n`);
    } catch (_) {
      sseClients.delete(res);
    }
  }
}

// Real-Time Server-Sent Events (SSE) stream
router.get('/api/v1/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  res.write(`data: ${JSON.stringify({ type: 'connected', ts: Date.now() })}\n\n`);
  sseClients.add(res);

  const keepAlive = setInterval(() => {
    try {
      res.write(': keep-alive\n\n');
    } catch (_) {
      clearInterval(keepAlive);
      sseClients.delete(res);
    }
  }, 25000);

  req.on('close', () => {
    clearInterval(keepAlive);
    sseClients.delete(res);
  });
});

// Bootstrap endpoint: loads current user + authorized & scoped collections in a single round-trip
router.get('/api/v1/bootstrap', async (req, res) => {
  try {
    const rawCollections = await db.getAllCollectionsSnapshot();
    const settings = await db.getSystemSettings();
    const isEmpty =
      (rawCollections.projects || []).length === 0 &&
      (rawCollections.openings || []).length === 0;

    const collections = {};
    for (const [col, docs] of Object.entries(rawCollections)) {
      collections[col] = filterAndSanitizeCollectionForUser(col, docs, req.apexUser);
    }

    res.json({
      status: 'ok',
      needsSeed: isEmpty && isStrictAdmin(req.apexUser),
      databaseMode: db.isUsingPostgres() ? 'postgresql' : 'local-fallback',
      user: sanitizeDocForResponse('users', req.apexUser, req.apexUser),
      system: {
        app_code: settings.app_code || 'apex',
        app_domain: settings.app_domain || 'https://apex.windowasia.com',
        ciam_enabled: settings.ciam_enabled === 'true',
        break_glass_enabled: settings.break_glass_enabled === 'true',
        ai_copilot_enabled: settings.ai_copilot_enabled === 'true'
      },
      collections
    });
  } catch (err) {
    res.status(500).json({ error: 'bootstrap_failed', message: err.message });
  }
});

// Initial Seed Endpoint (Strictly limited to Admin when database is completely unseeded)
router.post('/api/v1/seed', async (req, res) => {
  try {
    if (!isStrictAdmin(req.apexUser)) {
      return res.status(403).json({
        error: 'forbidden',
        message: 'เฉพาะผู้ดูแลระบบสูงสุด (Admin) เท่านั้นที่สามารถทำรายการ Seed ข้อมูลเริ่มต้นได้'
      });
    }
    const existingProjects = await db.getCollection('projects');
    if (existingProjects.length > 0) {
      return res.status(409).json({
        error: 'already_seeded',
        status: 'already_seeded',
        message: 'ระบบมีข้อมูลโครงการอยู่แล้ว ไม่สามารถ Seed ทับข้อมูลเดิมได้',
        projects: existingProjects.length
      });
    }
    const seed = req.body?.seed || {};
    let totalDocs = 0;
    for (const [col, docs] of Object.entries(seed)) {
      if (!db.VALID_COLLECTIONS.has(col) || !Array.isArray(docs)) continue;
      let seq = 0;
      for (const d of docs) {
        if (!d || typeof d !== 'object') continue;
        const docId = d.id || d.code || d.no || `d${++seq}`;
        let payload = { ...d, id: docId };
        if (col === 'users') {
          const existingUser = await db.getDoc('users', docId);
          payload = sanitizeIncomingUserPayload(payload, existingUser);
          if (docId === 'U01') {
            payload.role = 'admin';
            payload.is_active = true;
            payload.active = true;
          }
        }
        await db.setDoc(col, docId, payload, req.apexUser.id || 'initial-seed');
        totalDocs++;
      }
    }
    await db.insertAuditLog({
      eventCode: 'DATA-SEED',
      actorId: req.apexUser?.id || 'system',
      actorEmail: req.apexUser?.email || '',
      actorRole: req.apexUser?.role || 'admin',
      targetResource: 'apex_documents',
      details: { total_seeded_documents: totalDocs }
    });
    const rawCollections = await db.getAllCollectionsSnapshot();
    const collections = {};
    for (const [col, docs] of Object.entries(rawCollections)) {
      collections[col] = filterAndSanitizeCollectionForUser(col, docs, req.apexUser);
    }
    res.json({ status: 'seeded', totalDocs, collections });
  } catch (err) {
    res.status(500).json({ error: 'seed_failed', message: err.message });
  }
});

// Financial verification API (Track B CFO Waterfall & Invoice Calculator)
router.post('/api/v1/finance/verify-claim', (req, res) => {
  const result = finance.calculateContractorClaimWaterfall(req.body || {});
  res.json({ status: 'ok', calculation: result });
});

router.post('/api/v1/finance/verify-invoice', (req, res) => {
  const result = finance.calculateCustomerInvoice(req.body || {});
  res.json({ status: 'ok', calculation: result });
});

// Collection CRUD Endpoints (Enforcing RBAC permission & project/team scope per collection)
router.get('/api/v1/db/:collection', async (req, res) => {
  try {
    const col = req.params.collection;
    if (!db.VALID_COLLECTIONS.has(col)) {
      return res.status(400).json({ error: 'invalid_collection', message: `Unknown collection: ${col}` });
    }
    if (!canReadCollection(col, req.apexUser)) {
      return res.status(403).json({
        error: 'forbidden',
        message: `บัญชีนี้ไม่มีสิทธิ์อ่านข้อมูลในหมวด ${col}`
      });
    }
    const rawDocs = await db.getCollection(col);
    const docs = filterAndSanitizeCollectionForUser(col, rawDocs, req.apexUser);
    res.json({ status: 'ok', collection: col, docs });
  } catch (err) {
    res.status(400).json({ error: 'invalid_request', message: err.message });
  }
});

router.get('/api/v1/db/:collection/:id', async (req, res) => {
  try {
    const { collection, id } = req.params;
    if (!db.VALID_COLLECTIONS.has(collection)) {
      return res.status(400).json({ error: 'invalid_collection', message: `Unknown collection: ${collection}` });
    }
    const doc = await db.getDoc(collection, id);
    if (!doc) return res.status(404).json({ exists: false, data: null });

    const isSelfUser =
      collection === 'users' && (id === req.apexUser?.id || doc.uid === req.apexUser?.uid);
    if (!isSelfUser && !canReadCollection(collection, req.apexUser)) {
      return res.status(403).json({
        error: 'forbidden',
        message: `บัญชีนี้ไม่มีสิทธิ์อ่านข้อมูลในหมวด ${collection}`
      });
    }
    if (!isSelfUser && !isDocInUserScope(collection, doc, req.apexUser)) {
      return res.status(403).json({
        error: 'forbidden_scope',
        message: 'ข้อมูลนี้อยู่ภายนอกขอบเขตโครงการหรือทีมของคุณ'
      });
    }
    const safeDoc = sanitizeDocForResponse(collection, doc, req.apexUser);
    res.json({ exists: true, id: safeDoc.id, data: safeDoc });
  } catch (err) {
    res.status(400).json({ error: 'invalid_request', message: err.message });
  }
});

async function authorizeAndSanitizeMutation(req, res, collection, targetId = null, isDelete = false) {
  if (!db.VALID_COLLECTIONS.has(collection)) {
    res.status(400).json({ error: 'invalid_collection', message: `Unknown collection: ${collection}` });
    return null;
  }

  // Dedicated protection for users & roles: strictly admin with 'users' permission (no impersonation)
  if (collection === 'users' || collection === 'roles') {
    if (!isStrictAdmin(req.apexUser)) {
      res.status(403).json({
        error: 'forbidden',
        message: 'เฉพาะผู้ดูแลระบบ (Admin) ที่มีสิทธิ์จัดการผู้ใช้เท่านั้นที่สามารถแก้ไขข้อมูลผู้ใช้หรือบทบาทได้'
      });
      return null;
    }
    if (isDelete && collection === 'users' && targetId === 'U01') {
      res.status(403).json({
        error: 'forbidden',
        message: 'ไม่อนุญาตให้ลบบัญชีผู้ดูแลระบบหลัก (U01)'
      });
      return null;
    }
  }

  if (!canWriteCollection(collection, req.apexUser)) {
    res.status(403).json({
      error: 'forbidden',
      message: `บัญชีนี้ไม่มีสิทธิ์แก้ไขข้อมูลในหมวด ${collection}`
    });
    return null;
  }

  const existingDoc = targetId ? await db.getDoc(collection, targetId) : null;
  if (existingDoc && !isDocInUserScope(collection, existingDoc, req.apexUser)) {
    res.status(403).json({
      error: 'forbidden_scope',
      message: 'ไม่อนุญาตให้แก้ไขหรือลบข้อมูลนอกขอบเขตโครงการหรือทีมของคุณ'
    });
    return null;
  }

  if (isDelete) {
    return { existingDoc, payload: null };
  }

  let payload = { ...(req.body || {}) };
  if (collection === 'users') {
    payload = sanitizeIncomingUserPayload(payload, existingDoc);
    if ((targetId || payload.id) === 'U01' && payload.role && payload.role !== 'admin') {
      res.status(403).json({
        error: 'forbidden',
        message: 'ไม่อนุญาตให้ลดระดับสิทธิ์ของบัญชีผู้ดูแลระบบหลัก (U01)'
      });
      return null;
    }
  } else {
    delete payload.password;
    delete payload.password_hash;
    delete payload.admin_password_hash;
  }

  // Enforce contractor team & claim status rules
  if (req.apexUser.role === 'contractor') {
    if (['claims', 'engagements', 'timesheets'].includes(collection) && req.apexUser.team) {
      if (payload.team && payload.team !== req.apexUser.team) {
        res.status(403).json({
          error: 'forbidden_scope',
          message: 'ผู้รับเหมาช่วงสามารถส่งข้อมูลเฉพาะทีมของตนเองเท่านั้น'
        });
        return null;
      }
      payload.team = req.apexUser.team;
    }
    if (collection === 'claims' && payload.status) {
      const privilegedStatuses = ['approved', 'certified', 'paid'];
      if (privilegedStatuses.includes(String(payload.status).toLowerCase())) {
        res.status(403).json({
          error: 'forbidden',
          message: 'ผู้รับเหมาช่วงไม่สามารถอนุมัติหรือสั่งจ่ายใบเบิกงวดได้ด้วยตนเอง'
        });
        return null;
      }
    }
  }

  const candidateDoc = existingDoc ? { ...existingDoc, ...payload } : payload;
  if (!isDocInUserScope(collection, candidateDoc, req.apexUser)) {
    res.status(403).json({
      error: 'forbidden_scope',
      message: 'ข้อมูลที่บันทึกอยู่ภายนอกขอบเขตโครงการหรือทีมของคุณ'
    });
    return null;
  }

  return { existingDoc, payload };
}

router.post('/api/v1/db/:collection', async (req, res) => {
  try {
    const col = req.params.collection;
    const body = req.body || {};
    const id =
      body.id ||
      body.code ||
      `d_${Date.now().toString(36)}_${crypto.randomBytes(3).toString('hex')}`;

    const auth = await authorizeAndSanitizeMutation(req, res, col, id, false);
    if (!auth) return;

    const saved = await db.setDoc(col, id, auth.payload, req.apexUser.id);
    broadcastCollectionChange(col, 'add', id);
    res.status(201).json({
      status: 'ok',
      id,
      data: sanitizeDocForResponse(col, saved, req.apexUser)
    });
  } catch (err) {
    res.status(400).json({ error: 'write_failed', message: err.message });
  }
});

router.put('/api/v1/db/:collection/:id', async (req, res) => {
  try {
    const { collection, id } = req.params;
    const auth = await authorizeAndSanitizeMutation(req, res, collection, id, false);
    if (!auth) return;

    const saved = await db.setDoc(collection, id, auth.payload, req.apexUser.id);
    broadcastCollectionChange(collection, 'set', id);
    res.json({
      status: 'ok',
      id,
      data: sanitizeDocForResponse(collection, saved, req.apexUser)
    });
  } catch (err) {
    res.status(400).json({ error: 'write_failed', message: err.message });
  }
});

router.patch('/api/v1/db/:collection/:id', async (req, res) => {
  try {
    const { collection, id } = req.params;
    const auth = await authorizeAndSanitizeMutation(req, res, collection, id, false);
    if (!auth) return;

    const saved = await db.updateDoc(collection, id, auth.payload, req.apexUser.id);
    broadcastCollectionChange(collection, 'update', id);
    res.json({
      status: 'ok',
      id,
      data: sanitizeDocForResponse(collection, saved, req.apexUser)
    });
  } catch (err) {
    res.status(400).json({ error: 'update_failed', message: err.message });
  }
});

router.delete('/api/v1/db/:collection/:id', async (req, res) => {
  try {
    const { collection, id } = req.params;
    const auth = await authorizeAndSanitizeMutation(req, res, collection, id, true);
    if (!auth) return;

    await db.deleteDoc(collection, id);
    await db.insertAuditLog({
      eventCode: 'DATA-DELETE',
      actorId: req.apexUser.id,
      actorEmail: req.apexUser.email,
      actorRole: req.apexUser.role,
      targetResource: `${collection}/${id}`,
      details: { action: 'delete' }
    });
    broadcastCollectionChange(collection, 'delete', id);
    res.json({ status: 'ok', id });
  } catch (err) {
    res.status(400).json({ error: 'delete_failed', message: err.message });
  }
});

module.exports = router;
