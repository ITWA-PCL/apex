/**
 * APEX (apex.windowasia.com) - Mandatory Pre-Push Local Compile & Verification Suite
 * Verifies:
 * 1. JavaScript syntax across all Track A (Security), Track B (Workflow/UI) & Script files
 * 2. Track A RBAC Engine (10 Roles x 37 Permissions + EXT_DENY 17 permissions hard-deny)
 * 3. Track A Authentication Gate (Case-insensitive /API/* protection, zero unauthenticated fallback, 401 enforcement)
 * 4. Track A Password Migration & Zero Hardcoded Default Password (reconcileAdminPasswordSettings + PBKDF2-SHA256)
 * 5. Track A SSO Callback Hardening (No mockEmail/mockSub bypass, rejects fake code without valid OIDC state/secret)
 * 6. Track A DLP Privacy Scrubber & Zero-Training AI Copilot headers
 * 7. Track B 8-Step Subcontractor Claim Waterfall & Delivery VAT Exemption
 * 8. CI/CD & Deploy Script Hardening (execFileSync, pre-script git checkout of verified SHA, strict PostgreSQL healthcheck)
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const rootDir = path.resolve(__dirname, '..');
const filesToCheck = [
  'app/index.js',
  'app/src/db/postgres.js',
  'app/src/security/headers.js',
  'app/src/security/rbac.js',
  'app/src/security/ciam.js',
  'app/src/security/notifier.js',
  'app/src/security/copilot.js',
  'app/src/workflow/finance-engine.js',
  'app/src/workflow/collections-api.js',
  'app/public/js/apex-cloud-bridge.js',
  'app/public/js/ciam-admin-panel.js',
  'app/public/sw.js',
  'scripts/open-pr.js',
  'scripts/verify-local.js'
];

async function runVerification() {
  console.log('=================================================================');
  console.log(' 🔍 APEX Pre-Push Local Compile & Verification Suite');
  console.log('=================================================================');

  // 1. Syntax Compile Check
  for (const relPath of filesToCheck) {
    const fullPath = path.join(rootDir, relPath);
    execFileSync(process.execPath, ['--check', fullPath], { stdio: 'inherit' });
    console.log(` [OK] Syntax verified: ${relPath}`);
  }

  // 2. Track A RBAC & EXT_DENY Verification
  const rbac = require('../app/src/security/rbac');
  assert.strictEqual(rbac.PKEYS.length, 37, 'Must have exactly 37 permissions');
  assert.strictEqual(Object.keys(rbac.ROLE_DEF).length, 10, 'Must have 10 built-in roles');
  assert.strictEqual(rbac.EXT_DENY.length, 17, 'Must have 17 EXT_DENY permissions');

  const extPerms = rbac.computeEffectivePermissions({
    role: 'contractor',
    kind: 'external',
    grant: ['fin', 'users', 'claim.approve', 's4']
  });
  assert.ok(!extPerms.includes('fin'), 'EXT_DENY must strip fin from external user');
  assert.ok(!extPerms.includes('users'), 'EXT_DENY must strip users from external user');
  assert.ok(!extPerms.includes('claim.approve'), 'EXT_DENY must strip claim.approve from external user');
  assert.ok(extPerms.includes('s4'), 'Valid contractor permission s4 must remain');
  console.log(' [OK] Track A RBAC & EXT_DENY (17 hard-denied perms) verified');

  // 3. Track A Case-Insensitive Authentication Gate Verification
  const mockUnauthReq = { headers: {}, path: '/api/v1/bootstrap', originalUrl: '/api/v1/bootstrap' };
  let nextCalled = false;
  await rbac.resolveRequestUser(mockUnauthReq, {}, () => {
    nextCalled = true;
  });
  assert.strictEqual(nextCalled, true, 'resolveRequestUser must call next()');
  assert.strictEqual(mockUnauthReq.apexAuthenticated, false, 'Unauthenticated request must have apexAuthenticated=false');
  assert.strictEqual(mockUnauthReq.apexUser, null, 'Unauthenticated request must NOT select a fallback user');

  const protectedCaseVariants = [
    '/api/v1/bootstrap',
    '/API/v1/bootstrap',
    '/Api/V1/Seed',
    '/aPi/settings/ciam-sso/',
    '/API/V1/DB/users?limit=10'
  ];
  for (const variantUrl of protectedCaseVariants) {
    let statusSet = 200;
    let passedThrough = false;
    const reqVariant = {
      headers: {},
      path: variantUrl.split('?')[0],
      originalUrl: variantUrl,
      apexAuthenticated: false,
      apexUser: null
    };
    const resVariant = {
      status(code) {
        statusSet = code;
        return this;
      },
      json() {
        return this;
      }
    };
    rbac.enforceApiAuthentication(reqVariant, resVariant, () => {
      passedThrough = true;
    });
    assert.strictEqual(statusSet, 401, `Protected URL variant '${variantUrl}' must return 401 when unauthenticated`);
    assert.strictEqual(passedThrough, false, `Protected URL variant '${variantUrl}' must NOT call next()`);
  }
  console.log(' [OK] Track A Case-Insensitive Auth Gate (/api/*, /API/*, /Api/* -> 401) verified');

  // 4. Track A Password Migration & Zero Hardcoded Default Password Verification
  const db = require('../app/src/db/postgres');
  assert.strictEqual(
    db.DEFAULT_SYSTEM_SETTINGS.admin_local_password,
    undefined,
    'Plaintext admin_local_password must not exist in DEFAULT_SYSTEM_SETTINGS'
  );
  assert.strictEqual(
    db.DEFAULT_SYSTEM_SETTINGS.admin_password_hash,
    '',
    'DEFAULT_SYSTEM_SETTINGS.admin_password_hash must be empty (no hardcoded password hash in source)'
  );

  // Verify legacy admin_local_password migration takes priority over envInitialPassword
  const migrated = db.reconcileAdminPasswordSettings(
    { admin_local_password: 'LegacyCustomAdmin#99', admin_password_hash: '' },
    'EnvDefaultPass#1'
  );
  assert.strictEqual(migrated.migratedFromLegacy, true, 'Must flag migratedFromLegacy=true');
  assert.strictEqual(migrated.removeLegacyKey, true, 'Must flag removeLegacyKey=true');
  assert.strictEqual(
    db.verifyPassword('LegacyCustomAdmin#99', migrated.admin_password_hash),
    true,
    'Migrated hash must verify the legacy custom admin password'
  );
  assert.strictEqual(
    db.verifyPassword('EnvDefaultPass#1', migrated.admin_password_hash),
    false,
    'Legacy custom admin password must NOT be overwritten by env default password'
  );

  // Verify existing PBKDF2 hash is preserved and not overwritten by envInitialPassword
  const preserved = db.reconcileAdminPasswordSettings(
    { admin_password_hash: migrated.admin_password_hash },
    'NewEnvPass#2'
  );
  assert.strictEqual(
    db.verifyPassword('LegacyCustomAdmin#99', preserved.admin_password_hash),
    true,
    'Existing PBKDF2 admin_password_hash must be preserved across restarts'
  );

  // Verify initial bootstrap from APEX_INITIAL_ADMIN_PASSWORD when no legacy or existing hash is set
  const bootstrapped = db.reconcileAdminPasswordSettings({}, 'FreshBootstrapPass#2026');
  assert.strictEqual(
    db.verifyPassword('FreshBootstrapPass#2026', bootstrapped.admin_password_hash),
    true,
    'Fresh database must bootstrap admin_password_hash from APEX_INITIAL_ADMIN_PASSWORD'
  );
  console.log(' [OK] Track A Password Migration & PBKDF2-SHA256 Security verified');

  // 5. Track A SSO Callback Hardening Verification (No Mock Bypass)
  const ciamRouter = require('../app/src/security/ciam');
  const ciamSrc = fs.readFileSync(path.join(rootDir, 'app/src/security/ciam.js'), 'utf8');
  assert.ok(!ciamSrc.includes('mockEmail'), 'ciam.js must not accept mockEmail query parameter');
  assert.ok(!ciamSrc.includes('mockSub'), 'ciam.js must not accept mockSub query parameter');

  const callbackLayer = ciamRouter.stack.find(l => l.route && l.route.path === '/api/auth/sso/callback');
  assert.ok(callbackLayer, 'SSO callback route must exist');
  const callbackHandler = callbackLayer.route.stack[0].handle;

  rbac.ssoSessions.clear();
  let cbStatus = 200;
  let cbBody = null;
  await callbackHandler(
    {
      query: { code: 'fake_attacker_code', state: 'forged_state', email: 'u01@windowasia.co.th' },
      headers: {},
      socket: { remoteAddress: '127.0.0.1' }
    },
    {
      status(code) {
        cbStatus = code;
        return this;
      },
      json(payload) {
        cbBody = payload;
        return this;
      },
      setHeader() {},
      redirect() {}
    }
  );
  assert.ok(cbStatus === 403 || cbStatus === 400, `Forged SSO callback must be rejected with 400/403 (got ${cbStatus})`);
  assert.strictEqual(rbac.ssoSessions.size, 0, 'Forged SSO callback must NEVER create an active session');
  console.log(' [OK] Track A SSO Callback Hardening (forged callback rejected, 0 sessions created) verified');

  // 6. Track A AI Copilot DLP & Zero-Training Verification
  const copilot = require('../app/src/security/copilot');
  const scrubbed = copilot.sanitizeContextForPrivacy(
    'Tax 0105556012345 Phone 081-234-5678 Email cfo@windowasia.com'
  );
  assert.ok(!scrubbed.includes('0105556012345'), 'Tax ID must be scrubbed');
  assert.ok(!scrubbed.includes('081-234-5678'), 'Phone must be scrubbed');
  assert.ok(!scrubbed.includes('cfo@windowasia.com'), 'Email must be scrubbed');
  assert.strictEqual(copilot.ZERO_TRAINING_PRIVACY_HEADERS['X-Training-Opt-Out'], 'true');
  console.log(' [OK] Track A AI Copilot DLP & Zero-Training headers verified');

  // 7. Track B Finance Engine Verification
  const finance = require('../app/src/workflow/finance-engine');
  const wf = finance.calculateContractorClaimWaterfall({
    workValue: 100000,
    depDeduct: 10000,
    holdbackDeduct: 10000,
    isVatRegistered: true,
    whtPct: 3,
    retPct: 5
  });
  assert.strictEqual(wf.base, 80000, 'Step 4 taxable base must be 80,000');
  assert.strictEqual(wf.vatAmt, 5600, 'Step 5 VAT 7% on base must be 5,600');
  assert.strictEqual(wf.whtAmt, 2400, 'Step 6 WHT 3% on base must be 2,400');
  assert.strictEqual(wf.retAmt, 5000, 'Step 7 Retention 5% on FULL workValue must be 5,000');
  assert.strictEqual(wf.net, 78200, 'Step 8 Net payable must be 78,200');

  const inv = finance.calculateCustomerInvoice({
    goodsAndInstall: 200000,
    delivery: 15000,
    retPct: 5,
    whtPct: 3
  });
  assert.strictEqual(inv.vat, 14000, 'Delivery fee must NEVER carry 7% VAT');
  assert.strictEqual(inv.total, 229000, 'Total invoice must be 229,000');
  console.log(' [OK] Track B 8-Step Claim Waterfall & Delivery VAT Exemption verified');

  // 8. Deploy & PR Script Hardening Verification
  const openPrSrc = fs.readFileSync(path.join(rootDir, 'scripts/open-pr.js'), 'utf8');
  assert.ok(!openPrSrc.includes('execSync('), 'scripts/open-pr.js must use execFileSync instead of execSync');
  assert.ok(openPrSrc.includes('verifyCleanAndRunLocalSuite()'), 'scripts/open-pr.js must actually execute verify-local.js');

  const deployVpsSrc = fs.readFileSync(path.join(rootDir, 'scripts/deploy-vps.sh'), 'utf8');
  assert.ok(deployVpsSrc.includes('APEX_DEPLOY_COMMIT'), 'scripts/deploy-vps.sh must support APEX_DEPLOY_COMMIT locking');
  assert.ok(
    deployVpsSrc.includes('"database":"postgresql"'),
    'scripts/deploy-vps.sh healthcheck must enforce database=postgresql (reject local-fallback)'
  );
  assert.ok(deployVpsSrc.includes('if [ "${HEALTH_OK}" -ne 1 ]; then'), 'scripts/deploy-vps.sh must abort with exit 1 on failed healthcheck');

  const workflowSrc = fs.readFileSync(path.join(rootDir, '.github/workflows/deploy-hostinger.yml'), 'utf8');
  const checkoutIdx = workflowSrc.indexOf('git checkout --detach "${{ steps.prep.outputs.sha }}"');
  const bashDeployIdx = workflowSrc.indexOf('bash scripts/deploy-vps.sh');
  assert.ok(
    checkoutIdx > 0 && checkoutIdx < bashDeployIdx,
    'deploy-hostinger.yml must checkout the verified commit SHA BEFORE invoking bash scripts/deploy-vps.sh'
  );

  const composeSrc = fs.readFileSync(path.join(rootDir, 'docker-compose.yml'), 'utf8');
  assert.ok(
    composeSrc.includes('APEX_INITIAL_ADMIN_PASSWORD'),
    'docker-compose.yml must pass APEX_INITIAL_ADMIN_PASSWORD into apex-app container'
  );
  console.log(' [OK] CI/CD & Deploy Script Hardening (pre-script SHA checkout & PostgreSQL healthcheck) verified');

  // 9. Post-Login RBAC, Privilege Escalation Prevention & Data Scoping Verification
  const collectionsRouter = require('../app/src/workflow/collections-api');
  await db.setDoc(
    'users',
    'U01',
    {
      id: 'U01',
      uid: 'U01',
      email: 'admin@windowasia.com',
      name: 'System Admin',
      role: 'admin',
      is_active: true,
      password_hash: db.hashPassword('AdminStrongPass!999')
    },
    'test'
  );
  await db.setDoc(
    'users',
    'V01',
    {
      id: 'V01',
      uid: 'V01',
      email: 'viewer@windowasia.com',
      name: 'Project Viewer',
      role: 'viewer',
      projects: ['P01'],
      is_active: true,
      password_hash: db.hashPassword('ViewerPass!111')
    },
    'test'
  );
  await db.setDoc(
    'users',
    'C01',
    {
      id: 'C01',
      uid: 'C01',
      email: 'sub@contractor.co.th',
      name: 'Subcontractor Team 1',
      role: 'contractor',
      kind: 'external',
      is_external: true,
      use_ad_auth: false,
      projects: ['P01'],
      team: 'T01',
      is_active: true,
      password_hash: db.hashPassword('SubPass!222')
    },
    'test'
  );
  await db.setDoc(
    'projects',
    'P01',
    { id: 'P01', code: 'P01', name: 'Project Alpha', contractValue: 5000000, budget: 3500000 },
    'test'
  );
  await db.setDoc(
    'projects',
    'P02',
    { id: 'P02', code: 'P02', name: 'Project Beta', contractValue: 8000000, budget: 6000000 },
    'test'
  );
  await db.setDoc('budgets', 'B01', { id: 'B01', project: 'P01', amount: 3500000 }, 'test');
  await db.setDoc('claims', 'CL01', { id: 'CL01', project: 'P01', team: 'T01', status: 'draft', workValue: 50000 }, 'test');
  await db.setDoc('claims', 'CL02', { id: 'CL02', project: 'P01', team: 'T02', status: 'draft', workValue: 60000 }, 'test');

  async function invokeCollectionsRoute(method, urlPath, userId, body = {}) {
    return new Promise((resolve, reject) => {
      const req = {
        method,
        path: urlPath,
        url: urlPath,
        originalUrl: urlPath,
        headers: { cookie: `apex_session=test_${userId}` },
        query: {},
        body
      };
      rbac.ssoSessions.set(`test_${userId}`, {
        userId,
        email: `${userId}@windowasia.com`,
        role: userId === 'U01' ? 'admin' : userId === 'V01' ? 'viewer' : 'contractor',
        expiresAt: Date.now() + 60000
      });
      const res = {
        statusCode: 200,
        headers: {},
        body: null,
        setHeader(k, v) {
          this.headers[k] = v;
        },
        status(code) {
          this.statusCode = code;
          return this;
        },
        json(payload) {
          this.body = payload;
          resolve({ statusCode: this.statusCode, body: payload });
          return this;
        }
      };
      rbac.resolveRequestUser(req, res, err => {
        if (err) return reject(err);
        rbac.enforceApiAuthentication(req, res, err2 => {
          if (err2) return reject(err2);
          collectionsRouter.handle(req, res, err3 => {
            if (err3) return reject(err3);
            resolve({ statusCode: res.statusCode, body: res.body });
          });
        });
      });
    });
  }

  // 9a. Viewer attempting privilege escalation via /api/v1/seed or /api/v1/db/users -> MUST be 403
  const viewerSeedAttempt = await invokeCollectionsRoute('POST', '/api/v1/seed', 'V01', {
    force: true,
    seed: { users: [{ id: 'V01', role: 'admin' }] }
  });
  assert.strictEqual(viewerSeedAttempt.statusCode, 403, 'Viewer must receive 403 on POST /api/v1/seed');

  const viewerEscalationPut = await invokeCollectionsRoute('PUT', '/api/v1/db/users/V01', 'V01', {
    id: 'V01',
    role: 'admin'
  });
  assert.strictEqual(viewerEscalationPut.statusCode, 403, 'Viewer must receive 403 on PUT /api/v1/db/users/V01');

  const viewerRoleWrite = await invokeCollectionsRoute('POST', '/api/v1/db/roles', 'V01', {
    id: 'viewer',
    key: 'viewer',
    perms: rbac.PKEYS
  });
  assert.strictEqual(viewerRoleWrite.statusCode, 403, 'Viewer must receive 403 on POST /api/v1/db/roles');

  // Verify V01 is still viewer in DB
  const v01After = await db.getDoc('users', 'V01');
  assert.strictEqual(v01After.role, 'viewer', 'Viewer role must remain unchanged after failed escalation attempts');

  // 9b. Viewer attempting to read forbidden collections & password hashes
  const viewerGetUsers = await invokeCollectionsRoute('GET', '/api/v1/db/users', 'V01');
  assert.strictEqual(viewerGetUsers.statusCode, 403, 'Viewer must receive 403 on GET /api/v1/db/users');

  const viewerGetAdminDoc = await invokeCollectionsRoute('GET', '/api/v1/db/users/U01', 'V01');
  assert.strictEqual(viewerGetAdminDoc.statusCode, 403, 'Viewer must receive 403 on GET /api/v1/db/users/U01');

  const viewerGetBudgets = await invokeCollectionsRoute('GET', '/api/v1/db/budgets', 'V01');
  assert.strictEqual(viewerGetBudgets.statusCode, 403, 'Viewer must receive 403 on GET /api/v1/db/budgets');

  const viewerGetOutProject = await invokeCollectionsRoute('GET', '/api/v1/db/projects/P02', 'V01');
  assert.strictEqual(viewerGetOutProject.statusCode, 403, 'Viewer must receive 403 on out-of-scope project P02');

  const viewerBootstrap = await invokeCollectionsRoute('GET', '/api/v1/bootstrap', 'V01');
  assert.strictEqual(viewerBootstrap.statusCode, 200, 'Viewer bootstrap should succeed with scoped data');
  assert.strictEqual(viewerBootstrap.body.collections.budgets.length, 0, 'Viewer bootstrap must not expose budgets');
  assert.strictEqual(viewerBootstrap.body.collections.projects.length, 1, 'Viewer bootstrap must only include assigned project P01');
  assert.strictEqual(viewerBootstrap.body.collections.projects[0].id, 'P01');
  assert.strictEqual(
    viewerBootstrap.body.collections.projects[0].contractValue,
    undefined,
    'Viewer without fin permission must have financial fields stripped from projects'
  );
  assert.strictEqual(viewerBootstrap.body.collections.users.length, 1, 'Viewer bootstrap must only contain own user record');
  assert.strictEqual(viewerBootstrap.body.collections.users[0].id, 'V01');
  const rawBootstrapJson = JSON.stringify(viewerBootstrap.body);
  assert.ok(!rawBootstrapJson.includes('password_hash'), 'Bootstrap response must NEVER leak password_hash');
  assert.ok(!rawBootstrapJson.includes('pbkdf2_sha256'), 'Bootstrap response must NEVER leak PBKDF2 hash strings');

  // Even Admin reading /api/v1/db/users must not receive password_hash in response
  const adminGetUsers = await invokeCollectionsRoute('GET', '/api/v1/db/users', 'U01');
  assert.strictEqual(adminGetUsers.statusCode, 200, 'Admin must be allowed to read /api/v1/db/users');
  assert.ok(
    !JSON.stringify(adminGetUsers.body).includes('password_hash'),
    'Admin GET /api/v1/db/users must also strip password_hash from response'
  );

  // Admin attempting to re-seed when projects already exist must receive 409 already_seeded (even with force: true)
  const adminReSeed = await invokeCollectionsRoute('POST', '/api/v1/seed', 'U01', {
    force: true,
    seed: { projects: [{ id: 'P99', name: 'Overwrite Attempt' }] }
  });
  assert.strictEqual(adminReSeed.statusCode, 409, 'POST /api/v1/seed must reject re-seeding once projects exist');

  // 9c. Contractor team & claim status scoping
  const contractorReadOtherTeamClaim = await invokeCollectionsRoute('GET', '/api/v1/db/claims/CL02', 'C01');
  assert.strictEqual(
    contractorReadOtherTeamClaim.statusCode,
    403,
    'Contractor T01 must receive 403 when reading T02 claim'
  );
  const contractorApproveOwnClaim = await invokeCollectionsRoute('PATCH', '/api/v1/db/claims/CL01', 'C01', {
    status: 'approved'
  });
  assert.strictEqual(
    contractorApproveOwnClaim.statusCode,
    403,
    'Contractor must receive 403 when attempting to self-approve a claim'
  );
  console.log(' [OK] Post-Login RBAC, Privilege Escalation Prevention & Collection/Project Scoping verified');

  // 10. Spec v2.12.0: In-App Bot Defense, 90-Day Forced Password Rotation & Local Complexity Verification
  const headersMod = require('../app/src/security/headers');

  // 10a. Layer 1 Bot Defense: Auth Rate Limiter (10 req / 60s + Whitelist + Retry-After)
  const authLimiter = headersMod.createAuthRateLimiter({ limit: 10, windowMs: 60000 });
  const testIp = '203.0.113.42'; // External untrusted IP
  let limitedStatus = null;
  let retryAfterHeader = null;
  const mockResLimit = {
    setHeader(k, v) {
      if (k.toLowerCase() === 'retry-after') retryAfterHeader = v;
    },
    status(code) {
      limitedStatus = code;
      return this;
    },
    json() {
      return this;
    }
  };

  // 10 requests should pass through
  for (let i = 1; i <= 10; i++) {
    let passed = false;
    authLimiter({ headers: { 'x-forwarded-for': testIp } }, mockResLimit, () => {
      passed = true;
    });
    assert.strictEqual(passed, true, `Auth rate limiter must allow request #${i}`);
  }
  // 11th request must be rejected with 429 and Retry-After
  let eleventhPassed = false;
  authLimiter({ headers: { 'x-forwarded-for': testIp } }, mockResLimit, () => {
    eleventhPassed = true;
  });
  assert.strictEqual(eleventhPassed, false, '11th auth request must be blocked by rate limiter');
  assert.strictEqual(limitedStatus, 429, 'Auth rate limiter must return 429 Too Many Requests');
  assert.ok(retryAfterHeader, 'Auth rate limiter must emit Retry-After header');

  // Corporate Whitelist IP should never be blocked
  for (let i = 1; i <= 25; i++) {
    let wlPassed = false;
    authLimiter({ headers: { 'x-forwarded-for': '157.173.219.153' } }, mockResLimit, () => {
      wlPassed = true;
    });
    assert.strictEqual(wlPassed, true, 'Corporate Whitelist IP (157.173.219.153) must bypass rate limiter');
  }

  // 10b. Layer 2 Honeypot Decoy Trap & Layer 3 Timing Velocity Guard in /api/auth/login
  async function invokeAuthLogin(body, clientIp = '127.0.0.1') {
    return new Promise(resolve => {
      const req = {
        method: 'POST',
        path: '/api/auth/login',
        url: '/api/auth/login',
        originalUrl: '/api/auth/login',
        headers: { 'x-forwarded-for': clientIp },
        body
      };
      const res = {
        statusCode: 200,
        headers: {},
        body: null,
        setHeader(k, v) {
          this.headers[k] = v;
        },
        status(code) {
          this.statusCode = code;
          return this;
        },
        json(payload) {
          this.body = payload;
          resolve({ statusCode: this.statusCode, body: payload });
          return this;
        }
      };
      ciamRouter.handle(req, res, () => {
        resolve({ statusCode: res.statusCode, body: res.body });
      });
    });
  }

  // Honeypot filled -> Silent 401 Rejection
  const honeypotRes = await invokeAuthLogin({
    identifier: 'C01',
    password: 'SomePassword!1',
    corporate_fax: 'spambot_fax_number'
  });
  assert.strictEqual(honeypotRes.statusCode, 401, 'Honeypot trap must reject with 401 Unauthorized');

  // Timing Velocity Guard (< 400ms) -> 400 Bad Request
  const tooFastRes = await invokeAuthLogin({
    identifier: 'C01',
    password: 'SomePassword!1',
    form_render_ts: Date.now() - 100 // 100ms ago -> Bot automated submit
  });
  assert.strictEqual(tooFastRes.statusCode, 400, 'Velocity timing guard (< 400ms) must reject with 400 Bad Request');
  assert.strictEqual(tooFastRes.body.code, 'BOT_TIMING_VIOLATION');

  // 10c. Enterprise Password Complexity Standard (Spec v2.12.0 หมวด G.1)
  const validateComplexity = ciamRouter.validatePasswordComplexity;
  assert.ok(validateComplexity('short', 'somchai'), 'Must reject length < 8');
  assert.ok(validateComplexity('ThisIsWayTooLongPasswordForSure12345!', 'somchai'), 'Must reject length > 16');
  assert.ok(validateComplexity('alllowercase123!', 'somchai'), 'Must reject missing uppercase');
  assert.ok(validateComplexity('ALLUPPERCASE123!', 'somchai'), 'Must reject missing lowercase');
  assert.ok(validateComplexity('NoDigitsSpecial!', 'somchai'), 'Must reject missing digit');
  assert.ok(validateComplexity('NoSpecialChar123', 'somchai'), 'Must reject missing special char');
  assert.ok(validateComplexity('SomchaiPass123!', 'somchai'), 'Must reject username contained in password');
  assert.strictEqual(validateComplexity('SecurePass!2026', 'somchai'), null, 'Valid 8-16 complex password must pass');

  // 10d. 90-Day Forced Password Rotation Policy (STRICT RULE: Local Only, NEVER AD!)
  const checkExpiry = ciamRouter.checkPasswordExpiry90Days;
  const eightyNineDaysAgo = new Date(Date.now() - 89 * 86400000).toISOString();
  const ninetyOneDaysAgo = new Date(Date.now() - 91 * 86400000).toISOString();

  const notExpired = checkExpiry(eightyNineDaysAgo);
  assert.strictEqual(notExpired.expired, false, '89 days old password must NOT be expired');
  assert.strictEqual(notExpired.daysLeft, 1, '89 days old password should have 1 day left');

  const expired = checkExpiry(ninetyOneDaysAgo);
  assert.strictEqual(expired.expired, true, '91 days old password MUST be expired');
  assert.strictEqual(expired.daysLeft, 0, '91 days old password must have 0 days left');

  // Create Local Account C01 with 91 days old password
  await db.updateDoc(
    'users',
    'C01',
    {
      password_hash: db.hashPassword('SubPass!222'),
      use_ad_auth: false,
      password_changed_at: ninetyOneDaysAgo,
      must_change_password: false
    },
    'test'
  );

  // Login Local Account -> MUST require password change
  const localLoginRes = await invokeAuthLogin({
    identifier: 'C01',
    password: 'SubPass!222',
    form_render_ts: Date.now() - 2000
  });
  assert.strictEqual(localLoginRes.statusCode, 200, 'Local user login with valid credentials must succeed');
  assert.strictEqual(
    localLoginRes.body.must_change_password,
    true,
    'Local Account with password > 90 days MUST be flagged with must_change_password=true'
  );

  // Create AD Account A01 with 91 days old password -> MUST NEVER be flagged
  await db.setDoc(
    'users',
    'A01',
    {
      id: 'A01',
      uid: 'A01',
      email: 'aduser@windowasia.com',
      name: 'AD Corporate User',
      role: 'foreman',
      kind: 'internal',
      use_ad_auth: true, // AD Account!
      password_hash: db.hashPassword('AdPass!888'),
      password_changed_at: ninetyOneDaysAgo,
      must_change_password: false
    },
    'test'
  );

  const adLoginRes = await invokeAuthLogin({
    identifier: 'A01',
    password: 'AdPass!888',
    form_render_ts: Date.now() - 2000
  });
  assert.strictEqual(adLoginRes.statusCode, 200, 'AD user login must succeed');
  assert.strictEqual(
    adLoginRes.body.must_change_password,
    false,
    'AD Account MUST NEVER be forced to rotate password or have must_change_password=true'
  );
  console.log(' [OK] Spec v2.12.0 Bot Defense & 90-Day Local Password Policy (Strict AD Exclusion) verified');

  // 10e. CIAM Authority Lock (is_status_locked) on Directory Status API
  await db.setDoc(
    'users',
    'LOCK01',
    {
      id: 'LOCK01',
      uid: 'LOCK01',
      email: 'locked@windowasia.com',
      role: 'viewer',
      active: true,
      is_status_locked: true // Locked by CIAM Central Authority!
    },
    'test'
  );

  await db.updateSystemSettings({ ciam_management_api_key: 'test_mgmt_key_123' });

  async function invokeDirectoryPatch(username, body) {
    return new Promise(resolve => {
      const req = {
        method: 'PATCH',
        path: `/api/v1/directory/accounts/${username}/status`,
        url: `/api/v1/directory/accounts/${username}/status`,
        originalUrl: `/api/v1/directory/accounts/${username}/status`,
        headers: {
          'x-management-api-key': 'test_mgmt_key_123',
          'x-forwarded-for': '157.173.219.153'
        },
        params: { username },
        body
      };
      const res = {
        statusCode: 200,
        headers: {},
        body: null,
        status(code) {
          this.statusCode = code;
          return this;
        },
        json(payload) {
          this.body = payload;
          resolve({ statusCode: this.statusCode, body: payload });
          return this;
        }
      };
      ciamRouter.handle(req, res, () => {
        resolve({ statusCode: res.statusCode, body: res.body });
      });
    });
  }

  // Attempting status change on locked account without force_override must be rejected with 409
  const lockedPatchRes = await invokeDirectoryPatch('LOCK01', { is_active: false });
  assert.strictEqual(
    lockedPatchRes.statusCode,
    409,
    'Status update on account with is_status_locked=true must be rejected with 409 Conflict'
  );
  assert.strictEqual(lockedPatchRes.body.error, 'status_locked');

  // With force_override: true, authority override succeeds
  const forcePatchRes = await invokeDirectoryPatch('LOCK01', { is_active: false, force_override: true });
  assert.strictEqual(forcePatchRes.statusCode, 200, 'Authority override with force_override=true must succeed');
  console.log(' [OK] Spec v2.12.0 CIAM Authority Lock (is_status_locked) & 1-Click Status API verified');

  // 11. Enterprise User Management, Persistent Session DB, Complexity, Revocation & Group C Spec
  async function invokeCiamReq(method, reqPath, { headers = {}, body = null, query = {} } = {}) {
    return new Promise(resolve => {
      const req = {
        method,
        path: reqPath,
        url: reqPath,
        originalUrl: reqPath,
        query,
        headers,
        body
      };
      const res = {
        statusCode: 200,
        headers: {},
        body: null,
        setHeader(k, v) {
          this.headers[k] = v;
        },
        status(code) {
          this.statusCode = code;
          return this;
        },
        json(payload) {
          this.body = payload;
          resolve({ statusCode: this.statusCode, headers: this.headers, body: payload });
          return this;
        }
      };
      ciamRouter.handle(req, res, () => {
        resolve({ statusCode: res.statusCode, headers: res.headers, body: res.body });
      });
    });
  }

  // 11a. Login by username (case-insensitive) -> persistent DB session + last_login_at/lastSeen
  await db.setDoc(
    'users',
    'USR_LOGIN_1',
    {
      id: 'USR_LOGIN_1',
      uid: 'somchai.p',
      username: 'somchai.p',
      department: 'Engineering',
      email: 'somchai.p@windowasia.com',
      name: 'Somchai Test',
      role: 'pm',
      kind: 'internal',
      projects: 'all',
      active: true,
      use_ad_auth: false,
      password_hash: db.hashPassword('ApexPass#2026'),
      password_changed_at: new Date().toISOString(),
      must_change_password: false
    },
    'test'
  );

  const usernameLoginRes = await invokeCiamReq('POST', '/api/auth/login', {
    headers: { 'x-forwarded-for': '127.0.0.1' },
    body: {
      identifier: 'SOMCHAI.P',
      password: 'ApexPass#2026',
      form_render_ts: Date.now() - 2000
    }
  });
  assert.strictEqual(usernameLoginRes.statusCode, 200, 'Case-insensitive username login must succeed');
  const setCookieHeader = usernameLoginRes.headers['Set-Cookie'] || usernameLoginRes.headers['set-cookie'] || '';
  const cookieMatch = String(setCookieHeader).match(/apex_session=([^;]+)/);
  assert.ok(cookieMatch && cookieMatch[1], 'Login response must issue apex_session cookie');
  const persistedToken = cookieMatch[1];

  const dbSession = await db.getSession(persistedToken);
  assert.ok(dbSession, 'Session must be persisted to PostgreSQL / active_sessions fallback store');
  assert.strictEqual(dbSession.userId, 'USR_LOGIN_1', 'Persisted DB session must point to USR_LOGIN_1');

  const updatedUsr1 = await db.getDoc('users', 'USR_LOGIN_1');
  assert.ok(updatedUsr1.last_login_at && updatedUsr1.lastSeen, 'Login must update last_login_at and lastSeen');

  // Simulate process restart by clearing in-memory Map, verify resolveRequestUser recovers from DB
  rbac.ssoSessions.delete(persistedToken);
  await new Promise((resolve, reject) => {
    const req = { headers: { cookie: `apex_session=${persistedToken}` } };
    const res = {};
    rbac.resolveRequestUser(req, res, err => {
      if (err) return reject(err);
      assert.ok(req.apexUser, 'resolveRequestUser must recover session from persistent DB after memory clear');
      assert.strictEqual(req.apexUser.id, 'USR_LOGIN_1');
      assert.strictEqual(req.apexUser.username, 'somchai.p');
      resolve();
    });
  });

  // 11b. Local User Management via /api/v1/db/users: complexity + duplicate username + audit + sanitization
  const weakPwdCreate = await invokeCollectionsRoute('POST', '/api/v1/db/users', 'U01', {
    id: 'USR_WEAK',
    name: 'Weak User',
    username: 'weak.user',
    role: 'contractor',
    kind: 'external',
    company: 'Test Co',
    team: 'T01',
    projects: ['P01'],
    use_ad_auth: false,
    password: 'weak'
  });
  assert.strictEqual(weakPwdCreate.statusCode, 400, 'Weak password on POST /api/v1/db/users must be rejected');
  assert.strictEqual(weakPwdCreate.body.error, 'complexity_violation');

  const dupUsernameCreate = await invokeCollectionsRoute('POST', '/api/v1/db/users', 'U01', {
    id: 'USR_DUP',
    name: 'Dup Username',
    username: 'SOMCHAI.P',
    role: 'pm',
    kind: 'internal',
    projects: 'all',
    use_ad_auth: true
  });
  assert.strictEqual(dupUsernameCreate.statusCode, 400, 'Duplicate username must be rejected');
  assert.strictEqual(dupUsernameCreate.body.error, 'duplicate_username');

  const validLocalCreate = await invokeCollectionsRoute('POST', '/api/v1/db/users', 'U01', {
    id: 'USR_LOCAL_OK',
    name: 'Valid Contractor',
    username: 'contractor.k',
    department: 'Subcon Team A',
    email: 'contractor.k@example.com',
    role: 'contractor',
    kind: 'external',
    company: 'Subcon Co.',
    team: 'T01',
    projects: ['P01'],
    use_ad_auth: false,
    password: 'TeamPass#889',
    must_change_password: true
  });
  assert.strictEqual(validLocalCreate.statusCode, 201, 'Valid local user creation must succeed');
  assert.strictEqual(validLocalCreate.body.data.has_password, true, 'Response must expose has_password=true');
  assert.strictEqual(validLocalCreate.body.data.password_hash, undefined, 'Response must never expose password_hash');
  assert.strictEqual(validLocalCreate.body.data.password, undefined, 'Response must never expose plaintext password');

  // 11c. Deactivating user via PATCH /api/v1/db/users/:id revokes sessions & enforces is_status_locked
  const deactivateRes = await invokeCollectionsRoute('PATCH', '/api/v1/db/users/USR_LOGIN_1', 'U01', {
    active: false
  });
  assert.strictEqual(deactivateRes.statusCode, 200, 'Deactivating non-locked user must succeed');
  assert.strictEqual(rbac.ssoSessions.has(persistedToken), false, 'In-memory session must be revoked on disable');
  assert.strictEqual(await db.getSession(persistedToken), null, 'Persisted DB session must be revoked on disable');

  const spokeLockAttempt = await invokeCollectionsRoute('PATCH', '/api/v1/db/users/LOCK01', 'U01', {
    active: true
  });
  assert.strictEqual(spokeLockAttempt.statusCode, 409, 'Updating active status on CIAM-locked user must return 409');
  assert.strictEqual(spokeLockAttempt.body.error, 'status_locked');

  const logsAfterMgmt = await db.getAuditLogs(30);
  assert.ok(logsAfterMgmt.some(l => l.event_code === 'USER-CREATE' && l.target_resource === 'users/USR_LOCAL_OK'), 'USER-CREATE audit log must be recorded');
  assert.ok(logsAfterMgmt.some(l => l.event_code === 'SSO-04' && l.target_resource === 'users/USR_LOGIN_1'), 'SSO-04 revocation audit log must be recorded');
  assert.ok(logsAfterMgmt.some(l => l.event_code === 'SPOKE_OVERRIDE_REJECTED' && l.target_resource === 'users/LOCK01'), 'SPOKE_OVERRIDE_REJECTED audit log must be recorded');

  // 11d. Group C Directory API Spec C.1/C.2 (/api/v1/directory/accounts*)
  const ciamPostAccount = await invokeCiamReq('POST', '/api/v1/directory/accounts', {
    headers: {
      'x-management-api-key': 'test_mgmt_key_123',
      'x-forwarded-for': '157.173.219.153'
    },
    body: {
      username: 'ciam.user1',
      full_name: 'CIAM User One',
      email: 'ciam.user1@windowasia.com',
      department: 'IT',
      group_name: 'qc',
      is_active: true
    }
  });
  assert.strictEqual(ciamPostAccount.statusCode, 201, 'Group C POST /api/v1/directory/accounts must create user');
  assert.strictEqual(ciamPostAccount.body.account.username, 'ciam.user1');
  assert.strictEqual(ciamPostAccount.body.account.group_name, 'qc');

  const ciamPostDup = await invokeCiamReq('POST', '/api/v1/directory/accounts', {
    headers: {
      'x-management-api-key': 'test_mgmt_key_123',
      'x-forwarded-for': '157.173.219.153'
    },
    body: {
      username: 'ciam.user1',
      full_name: 'Duplicate User',
      group_name: 'viewer'
    }
  });
  assert.strictEqual(ciamPostDup.statusCode, 409, 'Group C duplicate POST without upsert must return 409 Conflict');

  const ciamListFiltered = await invokeCiamReq('GET', '/api/v1/directory/accounts', {
    headers: {
      'x-management-api-key': 'test_mgmt_key_123',
      'x-forwarded-for': '157.173.219.153'
    },
    query: { status: 'active', department: 'IT' }
  });
  assert.strictEqual(ciamListFiltered.statusCode, 200, 'Group C filtered GET must return 200');
  assert.ok(ciamListFiltered.body.summary && typeof ciamListFiltered.body.summary.total === 'number', 'Group C GET must return Spec C.1 summary');
  assert.ok(
    ciamListFiltered.body.accounts.some(a => a.username === 'ciam.user1' && a.department === 'IT'),
    'Filtered Group C response must contain matching active IT department account'
  );
  assert.ok(
    ciamListFiltered.body.accounts.every(a => a.is_active === true && String(a.department).toLowerCase().includes('it')),
    'Filtered Group C response must exclude non-matching status/department accounts'
  );
  console.log(' [OK] Enterprise User Management, Persistent DB Session, Revocation & Group C Spec C.1/C.2 verified');

  // 12. 3-Tier User Account Standardization, First-Time Invite/Register, 2FA OTP & Telegram/Email Settings
  const notifier = require('../app/src/security/notifier');
  async function invokeAdminCiamReq(method, reqPath, { headers = {}, body = null, query = {} } = {}) {
    return new Promise(resolve => {
      const hdrs = {
        'x-forwarded-for': '127.0.0.1',
        host: 'apex.windowasia.com',
        ...Object.fromEntries(Object.entries(headers || {}).map(([k, v]) => [k.toLowerCase(), v]))
      };
      const req = {
        method,
        path: reqPath,
        url: reqPath,
        originalUrl: reqPath,
        query,
        headers: hdrs,
        protocol: 'https',
        get(h) {
          return this.headers[String(h).toLowerCase()];
        },
        body,
        apexAuthenticated: true,
        apexUser: {
          id: 'U01',
          uid: 'admin',
          email: 'admin@windowasia.com',
          role: 'admin',
          permissions: ['users']
        }
      };
      const res = {
        statusCode: 200,
        headers: {},
        body: null,
        setHeader(k, v) {
          this.headers[k] = v;
        },
        status(code) {
          this.statusCode = code;
          return this;
        },
        json(payload) {
          this.body = payload;
          resolve({ statusCode: this.statusCode, headers: this.headers, body: payload });
          return this;
        }
      };
      ciamRouter.handle(req, res, () => {
        resolve({ statusCode: res.statusCode, headers: res.headers, body: res.body });
      });
    });
  }

  // 12a. 3-Tier User Standardization & AD-Only Guard
  const extConCreate = await invokeCollectionsRoute('POST', '/api/v1/db/users', 'U01', {
    id: 'EXT_CON_1',
    name: 'Contractor Invite One',
    username: 'ext.con1',
    email: 'con1@contractor.co.th',
    telegram_chat_id: '998877',
    department: 'External Installers',
    role: 'contractor',
    kind: 'external',
    company: 'SubCon Co',
    team: 'T01',
    projects: ['P2601'],
    use_ad_auth: true, // Must be forced to false for external users
    send_invite: true
  });
  assert.strictEqual(extConCreate.statusCode, 201, 'Creating external contractor with send_invite must return 201');
  assert.strictEqual(extConCreate.body.data.use_ad_auth, false, 'External account must always force use_ad_auth=false');
  assert.strictEqual(extConCreate.body.data.has_pending_invite, true, 'External account with send_invite must expose has_pending_invite=true');
  assert.strictEqual(extConCreate.body.data.registration_status, 'pending_invite', 'Initial invite status must be pending_invite');
  assert.ok(extConCreate.body.invite && /^\d{6}$/.test(extConCreate.body.invite.invite_otp), 'Invite response must include 6-digit OTP');
  assert.ok(String(extConCreate.body.invite.registration_url || '').includes('register_token='), 'Invite response must include registration_url');

  const extConGet = await invokeCollectionsRoute('GET', '/api/v1/db/users/EXT_CON_1', 'U01');
  assert.strictEqual(extConGet.statusCode, 200);
  assert.strictEqual(extConGet.body.data.invite_token_hash, undefined, 'Sanitized user doc must never leak invite_token_hash');
  assert.strictEqual(extConGet.body.data.invite_otp_hash, undefined, 'Sanitized user doc must never leak invite_otp_hash');

  const intAdCreate = await invokeCollectionsRoute('POST', '/api/v1/db/users', 'U01', {
    id: 'INT_AD_ONLY',
    name: 'Internal AD Only',
    username: 'ad.only1',
    email: 'adonly@windowasia.com',
    department: 'QC',
    role: 'qc',
    kind: 'internal',
    projects: 'all',
    use_ad_auth: true,
    password: 'ValidPass#123'
  });
  assert.strictEqual(intAdCreate.statusCode, 201, 'Creating internal AD user must return 201');
  assert.strictEqual(intAdCreate.body.data.use_ad_auth, true);
  assert.strictEqual(intAdCreate.body.data.has_password, false, 'AD user must strip local password_hash');
  assert.strictEqual(intAdCreate.body.data.registration_status, 'active_ad', 'AD user must have registration_status=active_ad');

  await db.updateSystemSettings({ ciam_enabled: 'true', break_glass_enabled: 'false' }, 'U01');
  const adLoginBlocked = await invokeCiamReq('POST', '/api/auth/login', {
    headers: { 'x-forwarded-for': '127.0.0.1' },
    body: {
      identifier: 'ad.only1',
      password: 'ValidPass#123',
      form_render_ts: Date.now() - 2000
    }
  });
  await db.updateSystemSettings({ ciam_enabled: 'false', break_glass_enabled: 'false' }, 'U01');
  assert.strictEqual(adLoginBlocked.statusCode, 403, 'AD-managed user must be rejected on local password login when SSO is active');
  assert.strictEqual(adLoginBlocked.body.error, 'ad_sso_required');
  const adAuditLogs = await db.getAuditLogs(20);
  assert.ok(adAuditLogs.some(l => l.event_code === 'SSO-02' && l.target_resource === '/api/auth/login'), 'SSO-02 audit log must be recorded on AD local login block');

  // 12b. First-Time Invite & Registration Flow
  const pendingLoginRes = await invokeCiamReq('POST', '/api/auth/login', {
    headers: { 'x-forwarded-for': '127.0.0.1' },
    body: {
      identifier: 'ext.con1',
      password: 'AnyTempPassword#1',
      form_render_ts: Date.now() - 2000
    }
  });
  assert.strictEqual(pendingLoginRes.statusCode, 403, 'Passwordless pending Non-AD account must require first-time registration');
  assert.strictEqual(pendingLoginRes.body.error, 'registration_required');

  const sendInviteRes = await invokeAdminCiamReq('POST', '/api/v1/users/EXT_CON_1/send-invite');
  assert.strictEqual(sendInviteRes.statusCode, 200, 'POST /api/v1/users/:id/send-invite must return 200');
  assert.ok(/^\d{6}$/.test(sendInviteRes.body.invite_otp), 'send-invite must generate 6-digit invite_otp');
  assert.ok(String(sendInviteRes.body.registration_url || '').includes('register_token='), 'send-invite must return registration_url');

  const inviteAuditLogs = await db.getAuditLogs(20);
  assert.ok(inviteAuditLogs.some(l => l.event_code === 'USER-INVITE' && l.target_resource === 'users/EXT_CON_1'), 'USER-INVITE audit log must be recorded');
  assert.ok(inviteAuditLogs.some(l => l.event_code === 'NOTIFY-EMAIL'), 'NOTIFY-EMAIL audit log must be recorded');
  assert.ok(inviteAuditLogs.some(l => l.event_code === 'NOTIFY-TELEGRAM'), 'NOTIFY-TELEGRAM audit log must be recorded');

  const regCompleteRes = await invokeCiamReq('POST', '/api/auth/register-first-time', {
    headers: { 'x-forwarded-for': '127.0.0.1' },
    body: {
      identifier: 'ext.con1',
      token_or_otp: sendInviteRes.body.invite_otp,
      new_password: 'NewContractor#99',
      form_render_ts: Date.now() - 2000
    }
  });
  assert.strictEqual(regCompleteRes.statusCode, 200, 'POST /api/auth/register-first-time with valid OTP must succeed');
  const regSetCookie = regCompleteRes.headers['Set-Cookie'] || regCompleteRes.headers['set-cookie'] || '';
  assert.ok(/apex_session=[^;]+/.test(String(regSetCookie)), 'First-time registration must issue apex_session cookie');

  const extConAfterReg = await invokeCollectionsRoute('GET', '/api/v1/db/users/EXT_CON_1', 'U01');
  assert.strictEqual(extConAfterReg.body.data.registration_status, 'registered');
  assert.strictEqual(extConAfterReg.body.data.has_password, true);
  assert.strictEqual(extConAfterReg.body.data.has_pending_invite, false);
  const regAuditLogs = await db.getAuditLogs(20);
  assert.ok(regAuditLogs.some(l => l.event_code === 'USER-REGISTER' && l.actor_id === 'EXT_CON_1'), 'USER-REGISTER audit log must be recorded');

  // 12c. 2FA Login OTP Challenge & Verification
  const enableOtpPatch = await invokeCollectionsRoute('PATCH', '/api/v1/db/users/EXT_CON_1', 'U01', {
    otp_enabled: true
  });
  assert.strictEqual(enableOtpPatch.statusCode, 200);

  const otpLoginChallenge = await invokeCiamReq('POST', '/api/auth/login', {
    headers: { 'x-forwarded-for': '127.0.0.1' },
    body: {
      identifier: 'ext.con1',
      password: 'NewContractor#99',
      form_render_ts: Date.now() - 2000
    }
  });
  assert.strictEqual(otpLoginChallenge.statusCode, 200, '2FA OTP-enabled user login must return 200 challenge');
  assert.strictEqual(otpLoginChallenge.body.otp_required, true, 'Login must require OTP step before session issuance');
  assert.strictEqual(otpLoginChallenge.headers['Set-Cookie'] || otpLoginChallenge.headers['set-cookie'], undefined, 'No session cookie may be issued prior to OTP verification');

  const otpRequestRes = await invokeCiamReq('POST', '/api/auth/otp/request', {
    headers: { 'x-forwarded-for': '127.0.0.1' },
    body: { identifier: 'ext.con1', purpose: 'login_2fa' }
  });
  assert.strictEqual(otpRequestRes.statusCode, 200, 'POST /api/auth/otp/request must succeed');
  assert.ok(String(otpRequestRes.body.masked_email || '').includes('@'), 'OTP request must return masked_email');

  const otpWrongRes = await invokeCiamReq('POST', '/api/auth/otp/verify', {
    headers: { 'x-forwarded-for': '127.0.0.1' },
    body: { identifier: 'ext.con1', otp_code: '000000' }
  });
  assert.strictEqual(otpWrongRes.statusCode, 401, 'Invalid OTP must be rejected with 401');

  const freshOtp = await notifier.createAndSendOtpChallenge(await db.getDoc('users', 'EXT_CON_1'), 'login_2fa', '127.0.0.1');
  const otpVerifyOk = await invokeCiamReq('POST', '/api/auth/otp/verify', {
    headers: { 'x-forwarded-for': '127.0.0.1' },
    body: { identifier: 'ext.con1', otp_code: freshOtp.otp_code }
  });
  assert.strictEqual(otpVerifyOk.statusCode, 200, 'Valid OTP verification must return 200');
  const otpSetCookie = otpVerifyOk.headers['Set-Cookie'] || otpVerifyOk.headers['set-cookie'] || '';
  assert.ok(/apex_session=[^;]+/.test(String(otpSetCookie)), 'Valid OTP verification must issue apex_session cookie');
  const otpLogs = await db.getAuditLogs(30);
  assert.ok(otpLogs.some(l => l.event_code === 'OTP-SEND' && l.actor_id === 'EXT_CON_1'), 'OTP-SEND audit log must be recorded');
  assert.ok(otpLogs.some(l => l.event_code === 'OTP-FAIL' && l.actor_id === 'EXT_CON_1'), 'OTP-FAIL audit log must be recorded');
  assert.ok(otpLogs.some(l => l.event_code === 'OTP-VERIFY' && l.actor_id === 'EXT_CON_1'), 'OTP-VERIFY audit log must be recorded');

  // 12d. Telegram & Email Notification Settings & Test Endpoints
  const testTgSimRes = await invokeAdminCiamReq('POST', '/api/settings/notifications/test-telegram', { body: {} });
  assert.strictEqual(testTgSimRes.statusCode, 200);
  assert.strictEqual(testTgSimRes.body.simulated, true, 'Unconfigured test Telegram endpoint must cleanly return simulated=true');

  const testEmailSimRes = await invokeAdminCiamReq('POST', '/api/settings/notifications/test-email', { body: {} });
  assert.strictEqual(testEmailSimRes.statusCode, 200);
  assert.strictEqual(testEmailSimRes.body.simulated, true, 'Unconfigured test Email endpoint must cleanly return simulated=true');

  const saveNotifySettings = await invokeAdminCiamReq('POST', '/api/settings/ciam-sso', {
    body: {
      telegram_enabled: true,
      telegram_bot_token: '123456:TEST_BOT_TOKEN_SECRET',
      telegram_chat_id: '-100999888',
      email_enabled: true,
      smtp_host: 'smtp.windowasia.com',
      smtp_port: 587,
      smtp_user: 'noreply@windowasia.com',
      smtp_password: 'SmtpSecret#123',
      login_otp_external: true
    }
  });
  assert.strictEqual(saveNotifySettings.statusCode, 200, 'Saving Telegram/Email settings must return 200');

  const getNotifySettings = await invokeAdminCiamReq('GET', '/api/settings/ciam-sso');
  assert.strictEqual(getNotifySettings.statusCode, 200);
  assert.strictEqual(getNotifySettings.body.telegram_enabled, true);
  assert.ok(getNotifySettings.body.telegram_bot_token_masked && !String(getNotifySettings.body.telegram_bot_token_masked).includes('TEST_BOT_TOKEN_SECRET'), 'Telegram bot token must be masked in GET response');
  assert.strictEqual(getNotifySettings.body.email_enabled, true);
  assert.ok(getNotifySettings.body.smtp_password_masked && !String(getNotifySettings.body.smtp_password_masked).includes('SmtpSecret#123'), 'SMTP password must be masked in GET response');
  assert.strictEqual(getNotifySettings.body.login_otp_external, true);

  await invokeAdminCiamReq('POST', '/api/settings/ciam-sso', {
    body: {
      telegram_enabled: false,
      telegram_chat_id: '',
      email_enabled: false,
      smtp_host: '',
      login_otp_external: false
    }
  });
  await db.updateSystemSettings({ telegram_bot_token: '', smtp_password: '' }, 'U01');
  console.log(' [OK] 3-Tier User Standardization, First-Time Invite/Register, 2FA OTP & Telegram/Email Settings verified');

  console.log('=================================================================');
  console.log(' ✅ ALL LOCAL COMPILE & SECURITY/FINANCE CHECKS PASSED (0 ERRORS)');
  console.log('=================================================================');
}

runVerification().catch(err => {
  console.error('[VERIFY FAILED]', err);
  process.exit(1);
});
