/**
 * APEX (apex.windowasia.com) - Mandatory Pre-Push Local Compile & Verification Suite
 * Verifies:
 * 1. JavaScript syntax across all Track A (Security), Track B (Workflow/UI) & Script files
 * 2. Track A RBAC Engine (10 Roles x 37 Permissions + EXT_DENY 17 permissions hard-deny)
 * 3. Track A Authentication Gate (Unauthenticated requests receive zero permissions & 401 on protected APIs; PBKDF2-SHA256 hashing)
 * 4. Track A DLP Privacy Scrubber & Zero-Training AI Copilot headers
 * 5. Track B 8-Step Subcontractor Claim Waterfall & Delivery VAT Exemption
 * 6. CI/CD & Deploy Script Hardening (No execSync shell injection in open-pr.js; strict commit lock & healthcheck exit 1 in deploy-vps.sh)
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

  // 3. Track A Unauthenticated Gate & PBKDF2 Password Security Verification
  const db = require('../app/src/db/postgres');
  assert.strictEqual(
    db.DEFAULT_SYSTEM_SETTINGS.admin_local_password,
    undefined,
    'Plaintext admin_local_password must not exist in DEFAULT_SYSTEM_SETTINGS'
  );
  const sampleHash = db.hashPassword('TestSecret#2026');
  assert.ok(sampleHash.startsWith('pbkdf2_sha256$'), 'Password hash must use PBKDF2-SHA256 format');
  assert.strictEqual(db.verifyPassword('TestSecret#2026', sampleHash), true, 'Valid password must verify');
  assert.strictEqual(db.verifyPassword('WrongPassword', sampleHash), false, 'Invalid password must fail');

  const mockUnauthReq = { headers: {}, path: '/api/v1/bootstrap' };
  let nextCalled = false;
  await rbac.resolveRequestUser(mockUnauthReq, {}, () => {
    nextCalled = true;
  });
  assert.strictEqual(nextCalled, true, 'resolveRequestUser must call next()');
  assert.strictEqual(mockUnauthReq.apexAuthenticated, false, 'Unauthenticated request must have apexAuthenticated=false');
  assert.strictEqual(mockUnauthReq.apexUser, null, 'Unauthenticated request must NOT select a fallback user or permissions');

  let statusSet = 200;
  let jsonBody = null;
  const mockRes = {
    status(code) {
      statusSet = code;
      return this;
    },
    json(payload) {
      jsonBody = payload;
      return this;
    }
  };
  rbac.enforceApiAuthentication(mockUnauthReq, mockRes, () => {});
  assert.strictEqual(statusSet, 401, 'Protected API must return 401 when unauthenticated');
  assert.strictEqual(jsonBody?.error, 'unauthenticated', 'Protected API must return unauthenticated error code');
  console.log(' [OK] Track A Authentication Gate (no unauthenticated fallback & 401 enforcement) verified');

  // 4. Track A AI Copilot DLP & Zero-Training Verification
  const copilot = require('../app/src/security/copilot');
  const scrubbed = copilot.sanitizeContextForPrivacy(
    'Tax 0105556012345 Phone 081-234-5678 Email cfo@windowasia.com'
  );
  assert.ok(!scrubbed.includes('0105556012345'), 'Tax ID must be scrubbed');
  assert.ok(!scrubbed.includes('081-234-5678'), 'Phone must be scrubbed');
  assert.ok(!scrubbed.includes('cfo@windowasia.com'), 'Email must be scrubbed');
  assert.strictEqual(copilot.ZERO_TRAINING_PRIVACY_HEADERS['X-Training-Opt-Out'], 'true');
  console.log(' [OK] Track A AI Copilot DLP & Zero-Training headers verified');

  // 5. Track B Finance Engine Verification
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

  // 6. Deploy & PR Script Hardening Verification
  const openPrSrc = fs.readFileSync(path.join(rootDir, 'scripts/open-pr.js'), 'utf8');
  assert.ok(!openPrSrc.includes('execSync('), 'scripts/open-pr.js must use execFileSync instead of execSync');
  assert.ok(openPrSrc.includes('verifyCleanAndRunLocalSuite()'), 'scripts/open-pr.js must actually execute verify-local.js');

  const deployVpsSrc = fs.readFileSync(path.join(rootDir, 'scripts/deploy-vps.sh'), 'utf8');
  assert.ok(deployVpsSrc.includes('APEX_DEPLOY_COMMIT'), 'scripts/deploy-vps.sh must support APEX_DEPLOY_COMMIT locking');
  assert.ok(deployVpsSrc.includes('if [ "${HEALTH_OK}" -ne 1 ]; then'), 'scripts/deploy-vps.sh must abort with exit 1 on failed healthcheck');
  console.log(' [OK] CI/CD & Deploy Script Hardening (execFileSync, commit lock & strict healthcheck) verified');

  console.log('=================================================================');
  console.log(' ✅ ALL LOCAL COMPILE & SECURITY/FINANCE CHECKS PASSED (0 ERRORS)');
  console.log('=================================================================');
}

runVerification().catch(err => {
  console.error('[VERIFY FAILED]', err);
  process.exit(1);
});
