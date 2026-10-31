/**
 * =============================================================================
 * APEX (https://apex.windowasia.com)
 * Door & Window Installation Control System — Window Asia Public Company Limited
 * =============================================================================
 * Architecture:
 * - Track A (src/security/): ISO/IEC 27001:2022, Window Asia Central IAM v2.9.0
 *   (Groups A-E), RBAC (10 Roles x 37 Permissions + EXT_DENY), Audit Trail
 * - Track B (src/workflow/): Business Process Flow (10 Menus, 7 Setup Steps,
 *   S1-S8), 8-Step Subcontractor Claim Waterfall, POC, Cashflow, Forms F-00..F-18
 * =============================================================================
 */
const express = require('express');
const path = require('path');
const db = require('./src/db/postgres');
const { securityHeadersMiddleware, createRateLimiter } = require('./src/security/headers');
const { resolveRequestUser, enforceApiAuthentication } = require('./src/security/rbac');
const ciamRouter = require('./src/security/ciam');
const { router: copilotRouter } = require('./src/security/copilot');
const collectionsRouter = require('./src/workflow/collections-api');

const app = express();
const port = process.env.PORT || 3000;

// 1. ISO/IEC 27001:2022 Security Headers & Rate Limiting
app.use(securityHeadersMiddleware);
app.use(createRateLimiter({ windowMs: 60000, maxRequests: 600 }));

// 2. Body Parser (25MB limit to match auth-proxy client_max_body_size for site photos & drawings)
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

// 3. Resolve User Identity & Enforce API Authentication Gate (ISO/IEC 27001:2022 A.5.15)
app.use(resolveRequestUser);
app.use(enforceApiAuthentication);
app.use('/api', enforceApiAuthentication);

// 4. Health Check Endpoint (Used by Docker & Load Balancers — zero user info leakage)
app.get('/api/health', async (req, res) => {
  const settings = await db.getSystemSettings();
  res.json({
    status: 'ok',
    service: 'apex',
    version: '1.1.0',
    domain: settings.app_domain || 'https://apex.windowasia.com',
    database: db.isUsingPostgres() ? 'postgresql' : 'local-fallback',
    ciam_v2_9_0: true,
    authenticated: Boolean(req.apexAuthenticated),
    timestamp: new Date().toISOString()
  });
});

// 5. Mount Track A: Central IAM v2.9.0 (Groups A, B, C, D) & Group E AI Copilot
app.use(ciamRouter);
app.use(copilotRouter);

// 6. Mount Track B (CFO): 22 Collections Real-Time API, SSE & Financial Engine
app.use(collectionsRouter);

// 7. Serve PWA Static Assets & Application Shell (app/public)
const publicDir = path.join(__dirname, 'public');
app.use(express.static(publicDir));

// Fallback to PWA index.html for client-side routes
app.get('*', (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

async function startServer() {
  await db.initDatabase();
  app.listen(port, () => {
    console.log(`=================================================================`);
    console.log(` 🚀 APEX (apex.windowasia.com) Server listening on port ${port}`);
    console.log(` 🛡️ Security: ISO/IEC 27001:2022 + Window Asia CIAM v2.9.0 Ready`);
    console.log(`=================================================================`);
  });
}

startServer().catch(err => {
  console.error('[APEX] Fatal startup error:', err);
  process.exit(1);
});
