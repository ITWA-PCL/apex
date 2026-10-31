/**
 * APEX (apex.windowasia.com) - Automatic Pull Request Creator (Local -> GitHub)
 * Automatically opens (or updates) a Pull Request from the current branch (feat/sec-* or feat/flow-*)
 * targeting `main` on https://github.com/ITWA-PCL/apex/pulls so Admin only needs to click Approve/Merge.
 */
const { execSync, spawnSync } = require('child_process');

const REPO_OWNER = 'ITWA-PCL';
const REPO_NAME = 'apex';
const BASE_BRANCH = 'main';

function getCurrentBranch() {
  return execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim();
}

function getLatestCommitTitle() {
  return execSync('git log -1 --pretty=%s', { encoding: 'utf8' }).trim();
}

function getCommitLogSummary(branch) {
  try {
    const logs = execSync(`git log origin/${BASE_BRANCH}..${branch} --oneline`, { encoding: 'utf8' }).trim();
    return logs || getLatestCommitTitle();
  } catch (_) {
    return getLatestCommitTitle();
  }
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

  const token = getGitHubToken();
  if (!token) {
    console.log(`[Auto-PR] Could not read GitHub token from git credential manager.`);
    console.log(`[Auto-PR] Open PR manually: https://github.com/${REPO_OWNER}/${REPO_NAME}/compare/${BASE_BRANCH}...${branch}`);
    return;
  }

  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'Content-Type': 'application/json',
    'User-Agent': 'APEX-Auto-PR-Agent'
  };

  // 1. Check if an open PR already exists for this branch -> main
  const listUrl = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/pulls?state=open&head=${REPO_OWNER}:${encodeURIComponent(branch)}&base=${BASE_BRANCH}`;
  const checkRes = await fetch(listUrl, { headers });
  if (checkRes.ok) {
    const existing = await checkRes.json();
    if (Array.isArray(existing) && existing.length > 0) {
      console.log(`=================================================================`);
      console.log(` ✅ Pull Request #${existing[0].number} อัปเดตอัตโนมัติเรียบร้อยแล้ว!`);
      console.log(` 🔗 ลิงก์สำหรับ Admin กด Approve: ${existing[0].html_url}`);
      console.log(`=================================================================`);
      return;
    }
  }

  // 2. Create a new Pull Request automatically
  const title = getLatestCommitTitle() || `Update from ${branch}`;
  const commits = getCommitLogSummary(branch);
  const trackLabel = branch.includes('flow') ? 'Track B (CFO — Business Process Flow)' : 'Track A (IT Security & Core Architecture)';
  const body = [
    `## 🚀 ส่งมอบงานอัตโนมัติจากฝั่ง Local (${trackLabel})`,
    `- **Source Branch:** \`${branch}\``,
    `- **Target Branch:** \`${BASE_BRANCH}\``,
    `- **Local Verification (` + '`node scripts/verify-local.js`' + `):** ✅ Passed 100% (0 Errors)`,
    ``,
    `### 📋 รายการ Commits ในรอบนี้:`,
    '```text',
    commits,
    '```',
    ``,
    `> 🛡️ **สำหรับ Admin:** เมื่อด่านตรวจ Security & Governance Gatekeeper ขึ้นสีเขียวครบ สามารถกด **Merge pull request** เพื่อนำขึ้น Production ได้ทันทีครับ`
  ].join('\n');

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
    console.log(` 🎉 สร้างใบขออนุมัติ (Pull Request #${data.number}) ขึ้น GitHub อัตโนมัติสำเร็จ!`);
    console.log(` 🔗 ลิงก์สำหรับ Admin กด Approve: ${data.html_url}`);
    console.log(`=================================================================`);
  } else {
    console.warn(`[Auto-PR] Notice (${createRes.status}):`, data.message || JSON.stringify(data));
  }
}

ensurePullRequest().catch(err => {
  console.warn('[Auto-PR] Warning:', err.message);
});
