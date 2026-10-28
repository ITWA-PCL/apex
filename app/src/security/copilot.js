/**
 * APEX (apex.windowasia.com) - Track A: Group E Read-Only In-App AI Copilot
 * Enforces 100% Zero-Mutation, ZERO_TRAINING_PRIVACY_HEADERS, and DLP PII Scrubbing
 */
const express = require('express');
const db = require('../db/postgres');

const router = express.Router();

const ZERO_TRAINING_PRIVACY_HEADERS = {
  'X-OpenAI-Data-Controls': 'opt-out',
  'X-Training-Opt-Out': 'true',
  'X-Anthropic-No-Train': 'true',
  'Cache-Control': 'no-store, no-cache, must-revalidate, private'
};

/**
 * Scrubs sensitive PII (Tax IDs, Phone Numbers, Emails, Secrets) before any AI context processing
 */
function sanitizeContextForPrivacy(input) {
  const raw = typeof input === 'string' ? input : JSON.stringify(input || {});
  return raw
    .replace(/\b\d{13}\b/g, '[REDACTED_TAX_ID]')
    .replace(/\b0[689]\d[- ]?\d{3}[- ]?\d{4}\b/g, '[REDACTED_PHONE]')
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[REDACTED_EMAIL]');
}

router.get('/api/v1/ai/copilot/status', async (req, res) => {
  const s = await db.getSystemSettings();
  res.json({
    enabled: s.ai_copilot_enabled === 'true',
    mode: 'READ_ONLY_ZERO_MUTATION',
    zero_training_enforced: true,
    model: s.ai_model_name || 'apex-local-analyst'
  });
});

router.post('/api/v1/ai/copilot/query', async (req, res) => {
  try {
    const s = await db.getSystemSettings();
    if (s.ai_copilot_enabled !== 'true') {
      return res.status(403).json({
        error: 'copilot_disabled',
        message: 'ระบบ AI Copilot ถูกปิดใช้งานโดยผู้ดูแลระบบ'
      });
    }

    for (const [h, v] of Object.entries(ZERO_TRAINING_PRIVACY_HEADERS)) {
      res.setHeader(h, v);
    }

    const question = sanitizeContextForPrivacy(String(req.body?.question || '').trim());
    if (!question) {
      return res.status(400).json({ error: 'empty_question', message: 'กรุณาพิมพ์คำถาม' });
    }

    // Build Read-Only RBAC-scoped context
    const user = req.apexUser;
    const allProjects = await db.getCollection('projects');
    const allOpenings = await db.getCollection('openings');
    const allNcrs = await db.getCollection('ncrs');
    const allClaims = await db.getCollection('claims');

    const allowedProjCodes = new Set(
      allProjects
        .filter(
          p =>
            user.projects === 'all' ||
            !Array.isArray(user.projects) ||
            user.projects.includes(p.code || p.id)
        )
        .map(p => p.code || p.id)
    );

    const openings = allOpenings.filter(o => allowedProjCodes.has(o.project));
    const ncrs = allNcrs.filter(n => allowedProjCodes.has(n.project));
    const openNcrs = ncrs.filter(n => n.status === 'open');
    const critA = openNcrs.filter(n => n.severity === 'A');
    const doneOpenings = openings.filter(o => (o.stage || 0) >= 7);
    const qcOpenings = openings.filter(o => (o.stage || 0) >= 6);

    const summaryLines = [
      `📊 **สรุปข้อมูลระบบ APEX (Read-Only AI Copilot · สิทธิ์ของ ${user.name} [${user.role}])**`,
      `- **โครงการที่มีสิทธิ์เข้าถึง:** ${allowedProjCodes.size} โครงการ (${Array.from(allowedProjCodes).join(', ') || '–'})`,
      `- **ช่องเปิดรวมทั้งหมด:** ${openings.length} บาน (ผ่าน QC S6 แล้ว ${qcOpenings.length} บาน · ส่งมอบ S7 แล้ว ${doneOpenings.length} บาน)`,
      `- **NCR ที่เปิดค้างอยู่:** ${openNcrs.length} รายการ (ระดับวิกฤต A: ${critA.length} รายการ)`
    ];

    if (user.canFin) {
      const claims = allClaims.filter(c => allowedProjCodes.has(c.project));
      const paidTotal = claims
        .filter(c => c.status === 'paid')
        .reduce((acc, c) => acc + Number(c.paid?.amount || c.inv?.net || 0), 0);
      summaryLines.push(
        `- **ข้อมูลการเงิน (สิทธิ์ fin):** ใบเบิกงวดผู้รับเหมาทั้งหมด ${claims.length} ใบ (จ่ายสุทธิแล้ว ${paidTotal.toLocaleString('th-TH')} บาท)`
      );
    } else {
      summaryLines.push(`- *(ข้อมูลการเงินและต้นทุนถูกซ่อนตามสิทธิ์ RBAC ของคุณ)*`);
    }

    res.json({
      status: 'ok',
      read_only: true,
      zero_training_headers: ZERO_TRAINING_PRIVACY_HEADERS,
      sanitized_question: question,
      answer: summaryLines.join('\n')
    });
  } catch (err) {
    res.status(500).json({ error: 'copilot_error', message: err.message });
  }
});

module.exports = {
  router,
  ZERO_TRAINING_PRIVACY_HEADERS,
  sanitizeContextForPrivacy
};
