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

  console.log('=================================================================');
  console.log(' ✅ ALL LOCAL COMPILE & SECURITY/FINANCE CHECKS PASSED (0 ERRORS)');
  console.log('=================================================================');
}

runVerification().catch(err => {
  console.error('[VERIFY FAILED]', err);
  process.exit(1);
});
