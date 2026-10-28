/**
 * APEX (apex.windowasia.com) - Track B (CFO): 22 Collections Real-Time API & SSE Broadcaster
 */
const express = require('express');
const crypto = require('crypto');
const db = require('../db/postgres');
const finance = require('./finance-engine');

const router = express.Router();

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

// Bootstrap endpoint: loads current user + all 22 collections in a single round-trip
router.get('/api/v1/bootstrap', async (req, res) => {
  try {
    const collections = await db.getAllCollectionsSnapshot();
    const settings = await db.getSystemSettings();
    const isEmpty =
      (collections.projects || []).length === 0 &&
      (collections.openings || []).length === 0;

    res.json({
      status: 'ok',
      needsSeed: isEmpty,
      databaseMode: db.isUsingPostgres() ? 'postgresql' : 'local-fallback',
      user: req.apexUser,
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

// Initial Seed Endpoint (populates PostgreSQL with initial dataset if database is empty)
router.post('/api/v1/seed', async (req, res) => {
  try {
    const existingProjects = await db.getCollection('projects');
    if (existingProjects.length > 0 && !req.body?.force) {
      return res.json({ status: 'already_seeded', projects: existingProjects.length });
    }
    const seed = req.body?.seed || {};
    let totalDocs = 0;
    for (const [col, docs] of Object.entries(seed)) {
      if (!db.VALID_COLLECTIONS.has(col) || !Array.isArray(docs)) continue;
      let seq = 0;
      for (const d of docs) {
        const docId = d.id || d.code || d.no || `d${++seq}`;
        await db.setDoc(col, docId, { ...d, id: docId }, 'initial-seed');
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
    const collections = await db.getAllCollectionsSnapshot();
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

// Collection CRUD Endpoints
router.get('/api/v1/db/:collection', async (req, res) => {
  try {
    const col = req.params.collection;
    const docs = await db.getCollection(col);
    res.json({ status: 'ok', collection: col, docs });
  } catch (err) {
    res.status(400).json({ error: 'invalid_request', message: err.message });
  }
});

router.get('/api/v1/db/:collection/:id', async (req, res) => {
  try {
    const { collection, id } = req.params;
    const doc = await db.getDoc(collection, id);
    if (!doc) return res.status(404).json({ exists: false, data: null });
    res.json({ exists: true, id: doc.id, data: doc });
  } catch (err) {
    res.status(400).json({ error: 'invalid_request', message: err.message });
  }
});

router.post('/api/v1/db/:collection', async (req, res) => {
  try {
    if (!req.apexUser?.canWrite) {
      return res.status(403).json({ error: 'forbidden', message: 'บัญชีนี้ไม่มีสิทธิ์แก้ไขข้อมูล' });
    }
    const col = req.params.collection;
    const body = req.body || {};
    const id =
      body.id ||
      body.code ||
      `d_${Date.now().toString(36)}_${crypto.randomBytes(3).toString('hex')}`;
    const saved = await db.setDoc(col, id, body, req.apexUser.id);
    broadcastCollectionChange(col, 'add', id);
    res.status(201).json({ status: 'ok', id, data: saved });
  } catch (err) {
    res.status(400).json({ error: 'write_failed', message: err.message });
  }
});

router.put('/api/v1/db/:collection/:id', async (req, res) => {
  try {
    if (!req.apexUser?.canWrite) {
      return res.status(403).json({ error: 'forbidden', message: 'บัญชีนี้ไม่มีสิทธิ์แก้ไขข้อมูล' });
    }
    const { collection, id } = req.params;
    const saved = await db.setDoc(collection, id, req.body || {}, req.apexUser.id);
    broadcastCollectionChange(collection, 'set', id);
    res.json({ status: 'ok', id, data: saved });
  } catch (err) {
    res.status(400).json({ error: 'write_failed', message: err.message });
  }
});

router.patch('/api/v1/db/:collection/:id', async (req, res) => {
  try {
    if (!req.apexUser?.canWrite) {
      return res.status(403).json({ error: 'forbidden', message: 'บัญชีนี้ไม่มีสิทธิ์แก้ไขข้อมูล' });
    }
    const { collection, id } = req.params;
    const saved = await db.updateDoc(collection, id, req.body || {}, req.apexUser.id);
    broadcastCollectionChange(collection, 'update', id);
    res.json({ status: 'ok', id, data: saved });
  } catch (err) {
    res.status(400).json({ error: 'update_failed', message: err.message });
  }
});

router.delete('/api/v1/db/:collection/:id', async (req, res) => {
  try {
    if (!req.apexUser?.canWrite) {
      return res.status(403).json({ error: 'forbidden', message: 'บัญชีนี้ไม่มีสิทธิ์ลบข้อมูล' });
    }
    const { collection, id } = req.params;
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
