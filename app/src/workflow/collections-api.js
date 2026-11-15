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
  filterAndSanitizeCollectionForUser,
  revokeUserSessions
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

async function prepareUserMutation(req, res, targetId, existingDoc, rawBody = {}) {
  const docId = String(targetId || rawBody.id || existingDoc?.id || '').trim();

  if (docId === 'U01' && rawBody.role && rawBody.role !== 'admin') {
    res.status(403).json({
      error: 'forbidden',
      message: 'ไม่อนุญาตให้ลดระดับสิทธิ์ของบัญชีผู้ดูแลระบบหลัก (U01)'
    });
    return null;
  }

  if (docId === 'U01' && (rawBody.active === false || rawBody.is_active === false)) {
    res.status(403).json({
      error: 'forbidden',
      message: 'ไม่อนุญาตให้ปิดการใช้งานบัญชีผู้ดูแลระบบหลัก (U01)'
    });
    return null;
  }

  if (existingDoc && existingDoc.is_status_locked === true && rawBody.force_override !== true) {
    const prevActive = existingDoc.active !== false && existingDoc.is_active !== false;
    const hasActiveFlag = rawBody.active !== undefined || rawBody.is_active !== undefined;
    if (hasActiveFlag) {
      const nextActive =
        rawBody.active !== undefined ? Boolean(rawBody.active) : Boolean(rawBody.is_active);
      if (nextActive !== prevActive) {
        await db.insertAuditLog({
          eventCode: 'SPOKE_OVERRIDE_REJECTED',
          actorId: req.apexUser?.id || null,
          actorEmail: req.apexUser?.email || null,
          actorRole: req.apexUser?.role || null,
          ipAddress: req.ip,
          targetResource: `users/${docId}`,
          details: { reason: 'is_status_locked', attempted_active: nextActive }
        });
        res.status(409).json({
          error: 'status_locked',
          message:
            'บัญชีนี้ถูกล็อกสถานะจาก Central IAM (CIAM) ไม่สามารถเปิด/ปิดการใช้งานจากฝั่ง Spoke ได้'
        });
        return null;
      }
    }
  }

  if (rawBody.username !== undefined) {
    const normalizedUsername = String(rawBody.username || '').trim();
    if (!normalizedUsername) {
      res.status(400).json({
        error: 'invalid_username',
        message: 'กรุณาระบุ Username สำหรับเข้าสู่ระบบ'
      });
      return null;
    }
    const existingUsers = await db.getCollection('users');
    const dupUser = existingUsers.find((u) => {
      if (!u || u.id === docId) return false;
      const candidate = String(u.username || '').trim().toLowerCase();
      return candidate && candidate === normalizedUsername.toLowerCase();
    });
    if (dupUser) {
      res.status(400).json({
        error: 'duplicate_username',
        message: `Username "${normalizedUsername}" ถูกใช้งานโดยบัญชีอื่นแล้ว (${dupUser.name || dupUser.id})`
      });
      return null;
    }
  }

  const effectiveUsername =
    rawBody.username !== undefined
      ? String(rawBody.username || '').trim()
      : existingDoc?.username || rawBody.email || docId;
  const hasPlainPassword = typeof rawBody.password === 'string' && rawBody.password.trim() !== '';

  if (hasPlainPassword) {
    const { validatePasswordComplexity } = require('../security/ciam');
    const complexityErr = validatePasswordComplexity(rawBody.password.trim(), effectiveUsername);
    if (complexityErr) {
      res.status(400).json({
        error: 'complexity_violation',
        message: complexityErr
      });
      return null;
    }
  }

  const payload = sanitizeIncomingUserPayload(rawBody, existingDoc);
  delete payload.force_override;
  const wantSendInvite = Boolean(rawBody.send_invite);
  delete payload.send_invite;

  if (rawBody.username !== undefined) {
    payload.username = String(rawBody.username || '').trim();
    if (!payload.uid && !existingDoc?.uid) {
      payload.uid = payload.username;
    }
  }

  const effectiveRole = rawBody.role !== undefined ? rawBody.role : existingDoc?.role;
  const effectiveKind = rawBody.kind !== undefined ? rawBody.kind : existingDoc?.kind;
  const isExt =
    effectiveKind === 'external' ||
    ['contractor', 'customer'].includes(String(effectiveRole || '').toLowerCase());
  payload.kind = isExt ? 'external' : 'internal';

  if (isExt) {
    payload.use_ad_auth = false;
  } else if (rawBody.use_ad_auth !== undefined || !existingDoc) {
    payload.use_ad_auth =
      rawBody.use_ad_auth !== undefined
        ? Boolean(rawBody.use_ad_auth)
        : (existingDoc?.use_ad_auth ?? docId !== 'U01');
  } else if (existingDoc && existingDoc.use_ad_auth !== undefined) {
    payload.use_ad_auth = Boolean(existingDoc.use_ad_auth);
  }

  if (payload.use_ad_auth === true) {
    payload.password_hash = null;
    payload.must_change_password = false;
    payload.registration_status = 'active_ad';
  } else if (hasPlainPassword) {
    payload.password_changed_at = new Date().toISOString();
    payload.registration_status = 'registered';
    if (typeof rawBody.must_change_password === 'boolean') {
      payload.must_change_password = rawBody.must_change_password;
    }
  } else {
    if (typeof rawBody.must_change_password === 'boolean') {
      payload.must_change_password = rawBody.must_change_password;
    }
    if (!existingDoc && !existingDoc?.password_hash) {
      payload.registration_status = 'pending_invite';
    }
  }

  if (rawBody.telegram_chat_id !== undefined || !existingDoc) {
    payload.telegram_chat_id = String(
      rawBody.telegram_chat_id ?? existingDoc?.telegram_chat_id ?? ''
    ).trim();
  }
  if (rawBody.otp_enabled !== undefined || !existingDoc) {
    payload.otp_enabled =
      rawBody.otp_enabled !== undefined
        ? Boolean(rawBody.otp_enabled)
        : Boolean(existingDoc?.otp_enabled);
  }

  const nowIso = new Date().toISOString();
  if (!existingDoc) {
    const initActive =
      rawBody.active !== undefined
        ? Boolean(rawBody.active)
        : rawBody.is_active !== undefined
          ? Boolean(rawBody.is_active)
          : true;
    payload.id = payload.id || docId;
    payload.uid = payload.uid || payload.username || docId;
    payload.active = initActive;
    payload.is_active = initActive;
    payload.status_origin = payload.status_origin || 'LOCAL';
    payload.status_updated_at = nowIso;
  } else if (rawBody.active !== undefined || rawBody.is_active !== undefined) {
    const nextActive =
      rawBody.active !== undefined ? Boolean(rawBody.active) : Boolean(rawBody.is_active);
    const prevActive = existingDoc.active !== false && existingDoc.is_active !== false;
    payload.active = nextActive;
    payload.is_active = nextActive;
    if (nextActive !== prevActive) {
      payload.status_origin = 'LOCAL';
      payload.status_updated_at = nowIso;
    }
  }

  return { payload, passwordUpdated: hasPlainPassword, wantSendInvite };
}

async function finalizeMutationSideEffects(
  req,
  collection,
  id,
  prevDoc,
  saved,
  passwordUpdated,
  wantSendInvite = false
) {
  if (collection === 'users' && saved) {
    const wasActive = prevDoc ? prevDoc.active !== false && prevDoc.is_active !== false : null;
    const isNowActive = saved.active !== false && saved.is_active !== false;

    if (!isNowActive) {
      await revokeUserSessions(saved);
    }

    let eventCode = 'USER-UPDATE';
    if (!prevDoc) {
      eventCode = 'USER-CREATE';
    } else if (wasActive && !isNowActive) {
      eventCode = 'SSO-04';
    } else if (passwordUpdated) {
      eventCode = 'PW-RESET';
    } else if (wasActive === false && isNowActive) {
      eventCode = 'USER-ACTIVATE';
    }

    await db.insertAuditLog({
      eventCode,
      actorId: req.apexUser?.id || null,
      actorEmail: req.apexUser?.email || null,
      actorRole: req.apexUser?.role || null,
      ipAddress: req.ip,
      targetResource: `users/${id}`,
      details: {
        username: saved.username || null,
        email: saved.email || null,
        role: saved.role || null,
        kind: saved.kind || null,
        active: isNowActive,
        use_ad_auth: saved.use_ad_auth !== false,
        otp_enabled: Boolean(saved.otp_enabled),
        must_change_password: Boolean(saved.must_change_password),
        method: req.method
      }
    });

    const notifier = require('../security/notifier');
    let inviteResult = null;
    if (
      saved.use_ad_auth === false &&
      isNowActive &&
      (wantSendInvite || (!prevDoc && !saved.password_hash))
    ) {
      inviteResult = await notifier.createRegistrationInvite(saved, req.apexUser, req.ip);
    } else if (!prevDoc) {
      const s = await db.getSystemSettings();
      if (s.telegram_enabled === 'true' && s.telegram_notify_user_provision === 'true') {
        await notifier
          .sendTelegramNotification({
            text: `<b>[APEX Provisioning]</b> สร้างบัญชีผู้ใช้ใหม่\n• ชื่อ: ${saved.name || saved.id} (<code>${saved.username || saved.id}</code>)\n• ประเภท: ${saved.kind === 'external' ? 'External Local' : saved.use_ad_auth !== false ? 'Internal AD SSO' : 'Internal Local'}\n• บทบาท: ${saved.role || ''}`,
            chatId: saved.telegram_chat_id || '',
            eventType: 'user_created',
            actor: req.apexUser,
            ipAddress: req.ip,
            targetResource: `users/${id}`
          })
          .catch(() => {});
      }
    }

    return inviteResult;
  } else if (collection === 'roles' && saved) {
    await db.insertAuditLog({
      eventCode: 'ROLE-UPDATE',
      actorId: req.apexUser?.id || null,
      actorEmail: req.apexUser?.email || null,
      actorRole: req.apexUser?.role || null,
      ipAddress: req.ip,
      targetResource: `roles/${id}`,
      details: {
        method: req.method,
        permissions_count: Array.isArray(saved.perms) ? saved.perms.length : null
      }
    });
  }
  return null;
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
  let passwordUpdated = false;
  let wantSendInvite = false;
  if (collection === 'users') {
    const prepared = await prepareUserMutation(req, res, targetId, existingDoc, payload);
    if (!prepared) return null;
    payload = prepared.payload;
    passwordUpdated = prepared.passwordUpdated;
    wantSendInvite = Boolean(prepared.wantSendInvite);
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

  return { existingDoc, payload, passwordUpdated, wantSendInvite };
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
    const invite = await finalizeMutationSideEffects(
      req,
      col,
      id,
      auth.existingDoc,
      saved,
      auth.passwordUpdated,
      auth.wantSendInvite
    );
    const latest = col === 'users' && invite ? (await db.getDoc(col, id)) || saved : saved;
    broadcastCollectionChange(col, 'add', id);
    res.status(201).json({
      status: 'ok',
      id,
      data: sanitizeDocForResponse(col, latest, req.apexUser),
      ...(invite ? { invite } : {})
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
    const invite = await finalizeMutationSideEffects(
      req,
      collection,
      id,
      auth.existingDoc,
      saved,
      auth.passwordUpdated,
      auth.wantSendInvite
    );
    const latest = collection === 'users' && invite ? (await db.getDoc(collection, id)) || saved : saved;
    broadcastCollectionChange(collection, 'set', id);
    res.json({
      status: 'ok',
      id,
      data: sanitizeDocForResponse(collection, latest, req.apexUser),
      ...(invite ? { invite } : {})
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
    const invite = await finalizeMutationSideEffects(
      req,
      collection,
      id,
      auth.existingDoc,
      saved,
      auth.passwordUpdated,
      auth.wantSendInvite
    );
    const latest = collection === 'users' && invite ? (await db.getDoc(collection, id)) || saved : saved;
    broadcastCollectionChange(collection, 'update', id);
    res.json({
      status: 'ok',
      id,
      data: sanitizeDocForResponse(collection, latest, req.apexUser),
      ...(invite ? { invite } : {})
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

    if (collection === 'users') {
      if (id === 'U01') {
        return res.status(403).json({
          error: 'forbidden',
          message: 'ไม่อนุญาตให้ลบบัญชีผู้ดูแลระบบหลัก (U01)'
        });
      }
      if (auth.existingDoc && auth.existingDoc.is_status_locked === true) {
        return res.status(409).json({
          error: 'status_locked',
          message: 'บัญชีนี้ถูกจัดการและล็อกสถานะโดย Central IAM (CIAM) ไม่สามารถลบจากฝั่ง Spoke ได้'
        });
      }
      if (auth.existingDoc) {
        await revokeUserSessions(auth.existingDoc);
      }
    }

    await db.deleteDoc(collection, id);
    await db.insertAuditLog({
      eventCode: 'DATA-DELETE',
      actorId: req.apexUser.id,
      actorEmail: req.apexUser.email,
      actorRole: req.apexUser.role,
      ipAddress: req.ip,
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
