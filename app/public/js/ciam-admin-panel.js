/**
 * APEX (apex.windowasia.com) - Track A: Central IAM v2.9.0 Admin UI, Audit Log Viewer & Read-Only AI Copilot
 * Integrates seamlessly into the APEX UI without conflicting with Track B (CFO) process flow screens.
 */
(function initApexSecurityAndCopilotUI() {
  let ciamSettings = null;
  let auditLogs = [];
  let copilotOpen = false;

  async function fetchCiamSettings() {
    try {
      const res = await fetch('/api/settings/ciam-sso');
      if (res.ok) ciamSettings = await res.json();
    } catch (_) {}
    try {
      const logRes = await fetch('/api/v1/audit/logs?limit=50');
      if (logRes.ok) {
        const d = await logRes.json();
        auditLogs = d.logs || [];
      }
    } catch (_) {}
  }

  function renderCiamAdminSection() {
    const usersSection = document.getElementById('v-users');
    if (!usersSection || usersSection.hidden) return;

    let panel = document.getElementById('apex-ciam-admin-card');
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'apex-ciam-admin-card';
      panel.className = 'card';
      panel.style.marginTop = '16px';
      usersSection.appendChild(panel);
      fetchCiamSettings().then(() => populateCiamPanel(panel));
    } else if (!panel.dataset.loaded) {
      fetchCiamSettings().then(() => populateCiamPanel(panel));
    }
  }

  function populateCiamPanel(panel) {
    if (!ciamSettings) return;
    panel.dataset.loaded = '1';
    const s = ciamSettings;
    panel.innerHTML = `
      <div class="card-head">
        <div>
          <h2>🛡️ Window Asia Central IAM (CIAM v2.9.0) & ISO/IEC 27001:2022 Security</h2>
          <span class="sub">ตั้งค่าการเชื่อมต่อ SSO (Zero .env Dependency · ตาราง <code>system_settings</code>) · โดเมนจริง: <strong>${s.app_domain || 'https://apex.windowasia.com'}</strong> · ฐานข้อมูล: <span class="pill ${s.database_mode === 'postgresql' ? 'good' : 'warn'}">${s.database_mode === 'postgresql' ? 'PostgreSQL (dept-db)' : 'Local Fallback'}</span></span>
        </div>
        <div class="row">
          <button type="button" class="btn sm" id="btnTestCiam">🔍 ทดสอบการเชื่อมต่อ OIDC</button>
          <button type="button" class="btn sm primary" id="btnSyncCiamNow">🔄 ซิงค์บัญชีผู้ใช้ทันที (Immediate Sync)</button>
          <button type="button" class="btn sm ${s.break_glass_enabled ? 'danger' : ''}" id="btnToggleBreakGlass">
            ${s.break_glass_enabled ? '🚨 ปิดโหมดฉุกเฉิน Break-Glass' : '⚡ เปิดโหมดฉุกเฉิน Break-Glass (172.18.0.1:3100)'}
          </button>
        </div>
      </div>

      <form id="ciamConfigForm" class="form-grid" style="margin-top:12px">
        <label>CIAM Issuer URL
          <input type="url" name="ciam_issuer_url" value="${s.ciam_issuer_url || 'https://ciam.windowasia.com'}" required>
        </label>
        <label>Spoke App Code
          <input type="text" name="app_code" value="${s.app_code || 'apex'}" readonly>
        </label>
        <label>OAuth2 Client ID
          <input type="text" name="ciam_client_id" value="${s.ciam_client_id || 'apex-spoke-client'}">
        </label>
        <label>OAuth2 Client Secret
          <input type="password" name="ciam_client_secret" placeholder="${s.ciam_client_secret_masked || 'ยังไม่ได้ตั้งค่า'}">
        </label>
        <label>SSO Callback URI
          <input type="url" name="ciam_redirect_uri" value="${s.ciam_redirect_uri || 'https://apex.windowasia.com/api/auth/sso/callback'}">
        </label>
        <label>Management API Key (Group C Push)
          <input type="password" name="ciam_management_api_key" placeholder="${s.ciam_management_api_key_masked || 'ยังไม่ได้ตั้งค่า'}">
        </label>
        <label>Allowed CIAM Push IPs (Whitelist)
          <input type="text" name="ciam_allowed_ips" value="${s.ciam_allowed_ips || '157.173.219.153,127.0.0.1'}">
        </label>
        <label>Break-Glass Fallback URL
          <input type="url" name="break_glass_url" value="${s.break_glass_url || 'http://172.18.0.1:3100'}">
        </label>
        <label class="row" style="gap:8px;align-self:end">
          <input type="checkbox" name="ciam_enabled" ${s.ciam_enabled ? 'checked' : ''} style="width:18px;height:18px">
          เปิดใช้งาน Central IAM SSO (PKCE S256)
        </label>
        <label class="row" style="gap:8px;align-self:end">
          <input type="checkbox" name="ai_copilot_enabled" ${s.ai_copilot_enabled ? 'checked' : ''} style="width:18px;height:18px">
          เปิดใช้งาน In-App AI Copilot (Read-Only · Zero-Training)
        </label>
        <div class="row" style="grid-column:1/-1;margin-top:6px">
          <button type="submit" class="btn primary">บันทึกการตั้งค่าลงตาราง system_settings (CFG-01)</button>
          <span class="hint" id="ciamStatusMsg">${s.last_directory_sync_at ? 'ซิงค์ล่าสุด: ' + s.last_directory_sync_at : ''}</span>
        </div>
      </form>

      <details class="uov" style="margin-top:16px" open>
        <summary><strong>📜 ประวัติ Audit Trail ตามมาตรฐาน ISO/IEC 27001:2022 (ตาราง <code>transaction_logs</code> ล่าสุด ${auditLogs.length} รายการ)</strong></summary>
        <div class="tablewrap" style="margin-top:8px;max-height:260px;overflow-y:auto">
          <table>
            <thead>
              <tr>
                <th>วัน-เวลา</th>
                <th>รหัสเหตุการณ์</th>
                <th>ผู้กระทำ (Actor)</th>
                <th>บทบาท</th>
                <th>IP Address</th>
                <th>เป้าหมาย (Resource)</th>
                <th>รายละเอียด</th>
              </tr>
            </thead>
            <tbody>
              ${
                auditLogs.length
                  ? auditLogs
                      .map(
                        l => `<tr>
                    <td class="mono">${new Date(l.created_at).toLocaleString('th-TH')}</td>
                    <td><span class="pill ${String(l.event_code).includes('04') || String(l.event_code).includes('DENY') ? 'bad' : String(l.event_code).startsWith('BG') ? 'warn' : 'acc'} mono">${l.event_code}</span></td>
                    <td>${l.actor_id || '–'} ${l.actor_email ? `<span class="sub2">${l.actor_email}</span>` : ''}</td>
                    <td>${l.actor_role || '–'}</td>
                    <td class="mono">${l.ip_address || '–'}</td>
                    <td class="mono">${l.target_resource || '–'}</td>
                    <td class="mono" style="font-size:11.5px">${JSON.stringify(l.details || {})}</td>
                  </tr>`
                      )
                      .join('')
                  : '<tr><td colspan="7" class="empty">ยังไม่มีรายการบันทึก Audit Log</td></tr>'
              }
            </tbody>
          </table>
        </div>
      </details>
    `;

    const form = panel.querySelector('#ciamConfigForm');
    form?.addEventListener('submit', async e => {
      e.preventDefault();
      const fd = new FormData(form);
      const body = Object.fromEntries(fd.entries());
      body.ciam_enabled = form.querySelector('[name=ciam_enabled]').checked;
      body.ai_copilot_enabled = form.querySelector('[name=ai_copilot_enabled]').checked;
      const res = await fetch('/api/settings/ciam-sso', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const out = await res.json();
      if (typeof window.toast === 'function') window.toast(out.message || 'บันทึกสำเร็จ');
      await fetchCiamSettings();
      populateCiamPanel(panel);
      syncCopilotButtonVisibility();
    });

    panel.querySelector('#btnTestCiam')?.addEventListener('click', async () => {
      const msgEl = panel.querySelector('#ciamStatusMsg');
      if (msgEl) msgEl.textContent = 'กำลังทดสอบการเชื่อมต่อ OIDC Discovery...';
      const res = await fetch('/api/settings/ciam-sso/test', { method: 'POST' });
      const out = await res.json();
      if (msgEl) msgEl.textContent = out.message || `เชื่อมต่อสำเร็จ: ${out.issuer || out.discovery_url}`;
      if (typeof window.toast === 'function') window.toast(out.message || 'ทดสอบ OIDC สำเร็จ');
    });

    panel.querySelector('#btnSyncCiamNow')?.addEventListener('click', async () => {
      const res = await fetch('/api/settings/ciam-sso/sync-now', { method: 'POST' });
      const out = await res.json();
      if (typeof window.toast === 'function') window.toast(out.message || 'ซิงค์ข้อมูลสำเร็จ');
      await fetchCiamSettings();
      populateCiamPanel(panel);
    });

    panel.querySelector('#btnToggleBreakGlass')?.addEventListener('click', async () => {
      const nextState = !s.break_glass_enabled;
      const res = await fetch('/api/auth/sso/break-glass', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: nextState, reason: 'Admin manual toggle from APEX UI' })
      });
      if (res.ok) {
        if (typeof window.toast === 'function') {
          window.toast(nextState ? 'เปิดโหมดฉุกเฉิน Break-Glass (BG-01) แล้ว' : 'ปิดโหมดฉุกเฉิน Break-Glass (BG-02) แล้ว');
        }
        await fetchCiamSettings();
        populateCiamPanel(panel);
      }
    });
  }

  // Group E: Read-Only In-App AI Copilot Floating Widget
  function initCopilotWidget() {
    const btn = document.createElement('button');
    btn.id = 'apex-copilot-fab';
    btn.type = 'button';
    btn.className = 'btn primary noprint';
    btn.style.cssText =
      'position:fixed;bottom:18px;right:18px;z-index:45;border-radius:999px;padding:10px 16px;box-shadow:0 6px 20px rgba(0,0,0,.18);font-weight:600;';
    btn.innerHTML = '🤖 AI วิเคราะห์โครงการ (Read-Only)';

    const box = document.createElement('div');
    box.id = 'apex-copilot-box';
    box.className = 'card noprint';
    box.hidden = true;
    box.style.cssText =
      'position:fixed;bottom:68px;right:18px;width:min(420px,calc(100vw - 32px));z-index:46;box-shadow:0 12px 32px rgba(0,0,0,.22);border:1px solid var(--accent);';
    box.innerHTML = `
      <div class="card-head" style="margin-bottom:8px">
        <div>
          <strong>🤖 APEX AI Copilot (Read-Only)</strong>
          <span class="sub">Zero-Mutation · Zero-Training · คัดกรอง PII อัตโนมัติ</span>
        </div>
        <button type="button" class="btn sm" id="apexCopilotClose">ปิด</button>
      </div>
      <div id="apexCopilotAnswer" style="background:var(--surface-2);padding:10px 12px;border-radius:8px;font-size:13px;white-space:pre-line;max-height:240px;overflow-y:auto;margin-bottom:8px">
        สวัสดีครับ! กดปุ่มสรุปสถานะด้านล่าง หรือพิมพ์คำถามเกี่ยวกับความคืบหน้าโครงการ ช่องเปิด และ NCR ได้เลยครับ
      </div>
      <form id="apexCopilotForm" class="row" style="flex-wrap:nowrap">
        <input type="text" id="apexCopilotInput" placeholder="เช่น สรุปความคืบหน้าทุกโครงการและ NCR ค้าง" value="สรุปภาพรวมความคืบหน้าโครงการและ NCR ค้าง" style="flex:1;min-width:0">
        <button type="submit" class="btn primary sm">ถาม AI</button>
      </form>
    `;

    document.body.appendChild(btn);
    document.body.appendChild(box);

    btn.addEventListener('click', () => {
      copilotOpen = !copilotOpen;
      box.hidden = !copilotOpen;
    });
    box.querySelector('#apexCopilotClose')?.addEventListener('click', () => {
      copilotOpen = false;
      box.hidden = true;
    });
    box.querySelector('#apexCopilotForm')?.addEventListener('submit', async e => {
      e.preventDefault();
      const input = box.querySelector('#apexCopilotInput');
      const ans = box.querySelector('#apexCopilotAnswer');
      const q = input.value.trim();
      if (!q) return;
      ans.textContent = 'กำลังวิเคราะห์ข้อมูลภายใต้สิทธิ์ RBAC ของคุณ...';
      try {
        const headers = { 'Content-Type': 'application/json' };
        const actAs = sessionStorage.getItem('actAs');
        if (actAs) headers['X-Act-As-User'] = actAs;
        const res = await fetch('/api/v1/ai/copilot/query', {
          method: 'POST',
          headers,
          body: JSON.stringify({ question: q })
        });
        const out = await res.json();
        ans.textContent = out.answer || out.message || 'ไม่สามารถประมวลผลคำตอบได้';
      } catch (err) {
        ans.textContent = 'เกิดข้อผิดพลาดในการเชื่อมต่อ AI Copilot';
      }
    });

    syncCopilotButtonVisibility();
  }

  async function syncCopilotButtonVisibility() {
    try {
      const res = await fetch('/api/v1/ai/copilot/status');
      if (res.ok) {
        const st = await res.json();
        const btn = document.getElementById('apex-copilot-fab');
        const box = document.getElementById('apex-copilot-box');
        if (btn) btn.hidden = !st.enabled;
        if (!st.enabled && box) box.hidden = true;
      }
    } catch (_) {}
  }

  window.addEventListener('DOMContentLoaded', () => {
    initCopilotWidget();
    // Observe navigation to the Users & Security view (#v-users)
    const usersView = document.getElementById('v-users');
    if (usersView) {
      new MutationObserver(() => {
        if (!usersView.hidden) {
          const panel = document.getElementById('apex-ciam-admin-card');
          if (!panel) renderCiamAdminSection();
        }
      }).observe(usersView, { attributes: true, attributeFilter: ['hidden'], childList: true });
    }
  });
})();
