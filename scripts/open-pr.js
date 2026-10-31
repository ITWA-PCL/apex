/**
 * APEX (apex.windowasia.com) - Verified Automatic Pull Request Creator (Local -> GitHub)
 * Security & Governance Guarantees:
 * 1. Uses execFileSync with argument arrays only (zero shell command concatenation).
 * 2. Verifies clean working tree and that HEAD matches origin/<branch>.
 * 3. Actually executes `node scripts/verify-local.js` on the exact HEAD commit before opening/updating PR.
 * 4. Updates existing open PR description with the latest verified commit SHA via PATCH.
 */
const { execFileSync, spawnSync } = require('child_process');
const path = require('path');

const REPO_OWNER = 'ITWA-PCL';
const REPO_NAME = 'apex';
const BASE_BRANCH = 'main';
const SAFE_REF_REGEX = /^[A-Za-z0-9._/-]+$/;

function runGit(args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

function assertSafeRef(refName) {
  if (!refName || refName.startsWith('-') || !SAFE_REF_REGEX.test(refName) || refName.includes('..')) {
    throw new Error(`Unsafe git ref rejected: ${refName}`);
  }
}

function getCurrentBranch() {
  const branch = runGit(['rev-parse', '--abbrev-ref', 'HEAD']);
  assertSafeRef(branch);
  return branch;
}

function getHeadSha() {
  return runGit(['rev-parse', 'HEAD']);
}

function getRemoteBranchSha(branch) {
  assertSafeRef(branch);
  try {
    return runGit(['rev-parse', `origin/${branch}`]);
  } catch (_) {
    return null;
  }
}

function getLatestCommitTitle() {
  return runGit(['log', '-1', '--pretty=%s']);
}

function getCommitLogSummary(branch) {
  assertSafeRef(branch);
  try {
    const range = `origin/${BASE_BRANCH}..${branch}`;
    const logs = runGit(['log', range, '--oneline']);
    return logs || getLatestCommitTitle();
  } catch (_) {
    return getLatestCommitTitle();
  }
}

function verifyCleanAndRunLocalSuite() {
  const dirty = runGit(['status', '--porcelain', '--untracked-files=no']);
  if (dirty) {
    throw new Error(
      `Working tree has uncommitted tracked changes:\n${dirty}\nPlease commit all tracked changes before running open-pr.js.`
    );
  }

  const verifyScript = path.join(__dirname, 'verify-local.js');
  const output = execFileSync(process.execPath, [verifyScript], { encoding: 'utf8' }).trim();
  return output;
}

function getGitHubToken() {
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
  const res = spawnSync('git', ['credential', 'fill'], {
    input: 'protocol=https\nhost=github.com\n\n',
    encoding: 'utf8'
  });
  if (res.status === 0 && res.stdout) {
    const match = res.stdout.match(/password=(.+)/);
    if (match && match[1]) return match[1].trim();
  }
  return null;
}

async function ensurePullRequest() {
  const branch = getCurrentBranch();
  if (!branch || branch === BASE_BRANCH || branch === 'HEAD') {
    console.log(`[Auto-PR] Currently on '${branch}', skipping PR creation.`);
    return;
  }

  const headSha = getHeadSha();
  const remoteSha = getRemoteBranchSha(branch);
  if (remoteSha && remoteSha !== headSha) {
    throw new Error(
      `Local HEAD (${headSha.slice(0, 7)}) does not match origin/${branch} (${remoteSha.slice(0, 7)}). Push your branch first.`
    );
  }

  // Run actual local verification suite against the exact committed HEAD
  const verifyOutput = verifyCleanAndRunLocalSuite();
  const verifiedAt = new Date().toISOString();

  const token = getGitHubToken();
  if (!token) {
    console.log(`[Auto-PR] Could not read GitHub token from git credential manager.`);
    console.log(
      `[Auto-PR] Open PR manually: https://github.com/${REPO_OWNER}/${REPO_NAME}/compare/${BASE_BRANCH}...${branch}`
    );
    return;
  }

  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'Content-Type': 'application/json',
    'User-Agent': 'APEX-Auto-PR-Agent'
  };

  const title = getLatestCommitTitle() || `Update from ${branch}`;
  const commits = getCommitLogSummary(branch);
  const trackLabel = branch.includes('flow')
    ? 'Track B (CFO — Business Process Flow)'
    : 'Track A (IT Security & Core Architecture)';

  const body = [
    `## 🚀 ส่งมอบงานอัตโนมัติจากฝั่ง Local (${trackLabel})`,
    `- **Source Branch:** \`${branch}\``,
    `- **Target Branch:** \`${BASE_BRANCH}\``,
    `- **Verified Commit SHA:** \`${headSha}\``,
    `- **Verified Timestamp (UTC):** \`${verifiedAt}\``,
    `- **Local Verification Suite (\`node scripts/verify-local.js\`):** ✅ Executed & Passed on commit \`${headSha.slice(0, 7)}\``,
    ``,
    `### 📋 รายการ Commits ใน PR นี้:`,
    '```text',
    commits,
    '```',
    ``,
    `<details><summary>🔍 ผลลัพธ์การรัน <code>node scripts/verify-local.js</code> บน Commit <code>${headSha.slice(0, 7)}</code></summary>`,
    ``,
    '```text',
    verifyOutput,
    '```',
    `</details>`
  ].join('\n');

  // 1. Check if an open PR already exists for this branch -> main
  const listUrl = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/pulls?state=open&head=${REPO_OWNER}:${encodeURIComponent(branch)}&base=${BASE_BRANCH}`;
  const checkRes = await fetch(listUrl, { headers });
  if (checkRes.ok) {
    const existing = await checkRes.json();
    if (Array.isArray(existing) && existing.length > 0) {
      const prNum = existing[0].number;
      const patchRes = await fetch(
        `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/pulls/${prNum}`,
        {
          method: 'PATCH',
          headers,
          body: JSON.stringify({ title, body })
        }
      );
      if (!patchRes.ok) {
        console.warn(`[Auto-PR] Could not update PR #${prNum} metadata (${patchRes.status})`);
      }
      console.log(`=================================================================`);
      console.log(` ✅ Pull Request #${prNum} อัปเดตพร้อมผลตรวจ Commit ${headSha.slice(0, 7)} เรียบร้อยแล้ว!`);
      console.log(` 🔗 ลิงก์สำหรับ Admin กด Approve: ${existing[0].html_url}`);
      console.log(`=================================================================`);
      return;
    }
  }

  // 2. Create a new Pull Request automatically
  const createRes = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/pulls`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      title,
      head: branch,
      base: BASE_BRANCH,
      body
    })
  });

  const data = await createRes.json();
  if (createRes.ok && data.html_url) {
    console.log(`=================================================================`);
    console.log(` 🎉 สร้างใบขออนุมัติ (Pull Request #${data.number}) ที่ Commit ${headSha.slice(0, 7)} สำเร็จ!`);
    console.log(` 🔗 ลิงก์สำหรับ Admin กด Approve: ${data.html_url}`);
    console.log(`=================================================================`);
  } else {
    throw new Error(`GitHub PR creation failed (${createRes.status}): ${data.message || JSON.stringify(data)}`);
  }
}

ensurePullRequest().catch(err => {
  console.error('[Auto-PR] Error:', err.message);
  process.exit(1);
});
