/**
 * APEX (apex.windowasia.com) - Track A: Enterprise Login Gate, Top Session Bar,
 * Dedicated System Settings View (#v-settings), Central IAM v2.9.0 Admin UI,
 * ISO/IEC 27001:2022 Audit Log Viewer & Read-Only AI Copilot
 */
(function initApexSecurityAndCopilotUI() {
  let ciamSettings = null;
  let sessionInfo = null;
  let auditLogs = [];
  let copilotOpen = false;

  const ROLE_TH = {
    admin: 'ผู้ดูแลระบบ',
    exec: 'ผู้บริหาร',
    pm: 'ผู้จัดการโครงการ',
    qc: 'วิศวกร / QC',
    foreman: 'โฟร์แมน',
    sales: 'ฝ่ายขาย / ประมาณราคา',
    acct: 'บัญชี / การเงิน',
    contractor: 'ผู้รับเหมา (ทีมช่าง)',
    customer: 'ลูกค้า / ผู้ควบคุมงาน',
    viewer: 'ดูอย่างเดียว'
  };

  function injectSecurityStyles() {
    if (document.getElementById('apex-security-styles')) return;
    const style = document.createElement('style');
    style.id = 'apex-security-styles';
    style.textContent = `
      /* Fix sidebar scrolling so bottom items and Settings menu are always reachable */
      aside.side {
        overflow-y: auto !important;
        max-height: 100vh !important;
      }
      /* Top Security & Session Bar */
      .apex-topbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        flex-wrap: wrap;
        padding: 10px 16px;
        margin-bottom: 14px;
        background: var(--surface);
        border: 1px solid var(--line);
        border-radius: 12px;
        box-shadow: 0 2px 8px rgba(0,0,0,.06);
      }
      .apex-topbar-left {
        display: flex;
        align-items: center;
        gap: 10px;
        flex-wrap: wrap;
        font-size: 13px;
      }
      .apex-topbar-right {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
      }
      /* Full-screen Login Gate */
      #apex-login-overlay {
        position: fixed;
        inset: 0;
        z-index: 9999;
        background: radial-gradient(circle at top right, #132a4a 0%, #0b1320 55%, #070b12 100%);
        color: #f0f6fc;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 20px;
        overflow-y: auto;
      }
      #apex-login-overlay[hidden] {
        display: none !important;
      }
      .apex-login-card {
        width: min(460px, 100%);
        background: #111927;
        border: 1px solid #26354d;
        border-radius: 16px;
        padding: 28px 26px;
        box-shadow: 0 24px 64px rgba(0,0,0,.55);
      }
      .apex-login-badge {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-size: 11.5px;
        font-weight: 600;
        letter-spacing: .04em;
        text-transform: uppercase;
        color: #58a6ff;
        background: rgba(56,139,253,.14);
        border: 1px solid rgba(56,139,253,.35);
        padding: 4px 10px;
        border-radius: 999px;
        margin-bottom: 10px;
      }
      .apex-login-card h1 {
        margin: 0 0 4px;
        font-size: 22px;
        color: #ffffff;
      }
      .apex-login-card .sub {
        color: #9fb1c6;
        font-size: 13px;
        margin-bottom: 18px;
        display: block;
      }
      .apex-sso-btn {
        width: 100%;
        padding: 12px 16px;
        border-radius: 10px;
        border: 1px solid #388bfd;
        background: linear-gradient(180deg, #2f81f7 0%, #1f6feb 100%);
        color: #ffffff;
        font-weight: 600;
        font-size: 14px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        box-shadow: 0 4px 14px rgba(31,111,235,.35);
      }
      .apex-sso-btn:hover {
        filter: brightness(1.08);
      }
      .apex-login-divider {
        display: flex;
        align-items: center;
        gap: 10px;
        color: #6e829a;
        font-size: 12px;
        margin: 18px 0;
      }
      .apex-login-divider::before,
      .apex-login-divider::after {
        content: "";
        flex: 1;
        height: 1px;
        background: #233146;
      }
      .apex-login-field {
        display: flex;
        flex-direction: column;
        gap: 5px;
        margin-bottom: 12px;
        font-size: 13px;
        color: #c9d6e3;
      }
      .apex-login-field input,
      .apex-login-field select {
        width: 100%;
        padding: 10px 12px;
        border-radius: 8px;
        border: 1px solid #2b3b54;
        background: #0b111b;
        color: #f0f6fc;
        font-size: 13.5px;
        box-sizing: border-box;
      }
      .apex-login-submit {
        width: 100%;
        padding: 11px 16px;
        border-radius: 10px;
        border: 1px solid #30435f;
        background: #1c293d;
        color: #ffffff;
        font-weight: 600;
        font-size: 14px;
        cursor: pointer;
        margin-top: 4px;
      }
      .apex-login-submit:hover {
        background: #253650;
      }
      .apex-login-error {
        background: rgba(248,81,73,.15);
        border: 1px solid rgba(248,81,73,.45);
        color: #ff7b72;
        padding: 9px 12px;
        border-radius: 8px;
        font-size: 12.5px;
        margin-bottom: 12px;
      }
      .apex-login-foot {
        margin-top: 16px;
        padding-top: 12px;
        border-top: 1px solid #1e2b3e;
        font-size: 11.5px;
        color: #7d90a7;
        display: flex;
        justify-content: space-between;
        flex-wrap: wrap;
        gap: 6px;
      }
      .apex-settings-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
        gap: 14px;
        margin-top: 12px;
      }
    `;
    document.head.appendChild(style);
  }

  async function fetchSessionInfo() {
    try {
      const res = await fetch('/api/auth/session');
      if (res.ok) {
        sessionInfo = await res.json();
        return sessionInfo;
      }
    } catch (_) {}
    return null;
  }

  async function fetchCiamSettings() {
    try {
      const res = await fetch('/api/settings/ciam-sso');
      if (res.ok) ciamSettings = await res.json();
    } catch (_) {}
    try {
      const logRes = await fetch('/api/v1/audit/logs?limit=80');
      if (logRes.ok) {
        const d = await logRes.json();
        auditLogs = d.logs || [];
      }
    } catch (_) {}
  }

  // ==========================================================================
  // 1. FULL-SCREEN ENTERPRISE LOGIN GATE
  // ==========================================================================
  function renderLoginOverlay() {
    let overlay = document.getElementById('apex-login-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'apex-login-overlay';
      overlay.className = 'noprint';
      document.body.appendChild(overlay);
    }

    const isAuthed = Boolean(sessionInfo?.authenticated);
    if (isAuthed) {
      overlay.hidden = true;
      return;
    }

    overlay.hidden = false;
    overlay.innerHTML = `
      <div class="apex-login-card">
        <div class="apex-login-badge">🛡️ Window Asia Public Co., Ltd. · ISO/IEC 27001:2022</div>
        <h1>เข้าสู่ระบบ APEX</h1>
        <span class="sub">ระบบควบคุมงานติดตั้งประตู-หน้าต่าง (S1–S8) · <code>apex.windowasia.com</code></span>

        <div id="apexLoginError" class="apex-login-error" hidden></div>

        <button type="button" class="apex-sso-btn" id="btnLoginCiamSso">
          🔐 เข้าสู่ระบบด้วย Window Asia Central IAM (SSO)
        </button>

        <div class="apex-login-divider">หรือเข้าสู่ระบบสำหรับผู้ดูแลระบบ / บัญชี Non-AD</div>

        <form id="apexLocalLoginForm">
          <label class="apex-login-field">
            <span>อีเมล หรือ รหัสผู้ใช้งาน (User ID)</span>
            <input type="text" name="identifier" id="apexLoginIdentifier" placeholder="กรอกอีเมลหรือรหัสผู้ใช้งาน" required autocomplete="username">
          </label>
          <label class="apex-login-field">
            <span>รหัสผ่าน (Password)</span>
            <input type="password" name="password" id="apexLoginPassword" value="" placeholder="กรอกรหัสผ่านของคุณ" required autocomplete="current-password">
          </label>
          <button type="submit" class="apex-login-submit" id="btnApexLoginSubmit">
            เข้าสู่ระบบ (Sign In) →
          </button>
        </form>

        <div class="apex-login-foot">
          <span>🔒 PKCE (S256) · Inactive Guard (SSO-04)</span>
          <span>DB: ${sessionInfo?.database_mode === 'postgresql' ? 'PostgreSQL 16' : 'Local Store'}</span>
        </div>
      </div>
    `;

    overlay.querySelector('#btnLoginCiamSso')?.addEventListener('click', () => {
      window.location.href = '/api/auth/sso/login';
    });

    overlay.querySelector('#apexLocalLoginForm')?.addEventListener('submit', async e => {
      e.preventDefault();
      const errBox = overlay.querySelector('#apexLoginError');
      const submitBtn = overlay.querySelector('#btnApexLoginSubmit');
      if (errBox) errBox.hidden = true;
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'กำลังตรวจสอบสิทธิ์...';
      }

      try {
        const identifier = overlay.querySelector('#apexLoginIdentifier')?.value || '';
        const password = overlay.querySelector('#apexLoginPassword')?.value || '';
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ identifier, password })
        });
        const out = await res.json();
        if (!res.ok) {
          if (errBox) {
            errBox.textContent = out.message || 'ไม่สามารถเข้าสู่ระบบได้';
            errBox.hidden = false;
          }
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = 'เข้าสู่ระบบ (Sign In) →';
          }
          return;
        }
        // Clear any old impersonation state and reload with active session cookie
        try {
          sessionStorage.removeItem('actAs');
        } catch (_) {}
        window.location.reload();
      } catch (err) {
        if (errBox) {
          errBox.textContent = 'เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์';
          errBox.hidden = false;
        }
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'เข้าสู่ระบบ (Sign In) →';
        }
      }
    });
  }

  // ==========================================================================
  // 2. TOP SECURITY BAR & SIDEBAR SETTINGS MENU (#v-settings)
  // ==========================================================================
  function openSettingsView() {
    const main = document.querySelector('main.main');
    if (!main) return;

    let settingsSection = document.getElementById('v-settings');
    if (!settingsSection) {
      settingsSection = document.createElement('section');
      settingsSection.className = 'view';
      settingsSection.id = 'v-settings';
      main.appendChild(settingsSection);
    }

    // Hide all other views inside <main> and show #v-settings
    main.querySelectorAll(':scope > section.view').forEach(sec => {
      sec.hidden = sec.id !== 'v-settings';
    });

    // Update sidebar active state
    document.querySelectorAll('.views .vbtn').forEach(btn => {
      if (btn.id === 'apex-nav-settings-btn') {
        btn.setAttribute('aria-current', 'page');
      } else {
        btn.removeAttribute('aria-current');
      }
    });

    renderFullSettingsPage(settingsSection);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function injectSidebarAndTopBar() {
    const nav = document.querySelector('nav.views');
    const main = document.querySelector('main.main');

    // 2.1 Add "⚙️ ตั้งค่าระบบ (SSO)" to Left Sidebar Navigation
    if (nav && !document.getElementById('apex-nav-settings-btn')) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.id = 'apex-nav-settings-btn';
      btn.className = 'vbtn';
      btn.innerHTML = `
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <circle cx="10" cy="10" r="3"/>
          <path d="M10 2v2.2M10 15.8V18M2 10h2.2M15.8 10H18M4.3 4.3l1.6 1.6M14.1 14.1l1.6 1.6M15.7 4.3l-1.6 1.6M5.9 14.1l-1.6 1.6"/>
        </svg>
        ตั้งค่าระบบ (SSO)
      `;
      btn.addEventListener('click', e => {
        e.preventDefault();
        e.stopPropagation();
        openSettingsView();
      });
      nav.appendChild(btn);

      // When any standard menu button is clicked, hide #v-settings
      nav.addEventListener('click', e => {
        const stdBtn = e.target.closest('[data-view]');
        if (stdBtn) {
          const settingsSec = document.getElementById('v-settings');
          if (settingsSec) settingsSec.hidden = true;
          btn.removeAttribute('aria-current');
        }
      });
    }

    // 2.2 Add Top Security & Session Bar at the top of <main>
    if (main && !document.getElementById('apex-topbar')) {
      const topbar = document.createElement('div');
      topbar.id = 'apex-topbar';
      topbar.className = 'apex-topbar noprint';
      main.insertBefore(topbar, main.firstChild);
    }
    updateTopBar();
  }

  function updateTopBar() {
    const topbar = document.getElementById('apex-topbar');
    if (!topbar) return;
    const u = sessionInfo?.user || window.__APEX_USER__ || { name: 'ผู้ดูแลระบบ', role: 'admin', email: 'u01@windowasia.co.th' };
    const dbMode = sessionInfo?.database_mode === 'postgresql' ? 'PostgreSQL 16 (ออนไลน์)' : 'Local Fallback';

    topbar.innerHTML = `
      <div class="apex-topbar-left">
        <span class="pill acc">👤 ${u.name || 'ผู้ดูแลระบบ'}</span>
        <span class="pill">${ROLE_TH[u.role] || u.role}</span>
        <span class="sub mono">${u.email || ''}</span>
        <span class="pill good" style="font-size:11.5px">🗄️ ${dbMode}</span>
      </div>
      <div class="apex-topbar-right">
        <button type="button" class="btn sm primary" id="btnTopOpenSettings">⚙️ ตั้งค่าระบบ & SSO</button>
        <button type="button" class="btn sm" id="btnTopLogout">🚪 ออกจากระบบ (Logout)</button>
      </div>
    `;

    topbar.querySelector('#btnTopOpenSettings')?.addEventListener('click', () => {
      openSettingsView();
    });

    topbar.querySelector('#btnTopLogout')?.addEventListener('click', async () => {
      await fetch('/api/auth/sso/logout', { method: 'POST' });
      try {
        sessionStorage.removeItem('actAs');
      } catch (_) {}
      window.location.reload();
    });
  }

  // ==========================================================================
  // 3. FULL SYSTEM SETTINGS, CIAM v2.9.0, AI COPILOT & AUDIT TRAIL PAGE
  // ==========================================================================
  async function renderFullSettingsPage(container) {
    container.innerHTML = `<div class="card">กำลังโหลดข้อมูลการตั้งค่าระบบและประวัติความปลอดภัย...</div>`;
    await fetchCiamSettings();

    if (!ciamSettings) {
      container.innerHTML = `
        <div class="card empty">
          เฉพาะผู้ดูแลระบบ (สิทธิ์จัดการผู้ใช้งาน) เท่านั้นที่สามารถเข้าถึงหน้าตั้งค่าระบบได้
        </div>
      `;
      return;
    }

    const s = ciamSettings;
    container.innerHTML = `
      <div class="phead">
        <div>
          <h2>⚙️ ตั้งค่าระบบ & ความปลอดภัย (System Settings & Central IAM v2.9.0)</h2>
          <div class="meta">
            บริหารจัดการการเชื่อมต่อ Window Asia Central IAM (SSO), รหัสผ่านผู้ดูแลระบบ, AI Copilot และตรวจสอบ Audit Log ตามมาตรฐาน ISO/IEC 27001:2022
          </div>
        </div>
        <div class="row">
          <button type="button" class="btn sm" id="btnTestCiam">🔍 ทดสอบการเชื่อมต่อ OIDC</button>
          <button type="button" class="btn sm primary" id="btnSyncCiamNow">🔄 ซิงค์บัญชีผู้ใช้ทันที (Immediate Sync)</button>
          <button type="button" class="btn sm ${s.break_glass_enabled ? 'danger' : ''}" id="btnToggleBreakGlass">
            ${s.break_glass_enabled ? '🚨 ปิดโหมดฉุกเฉิน Break-Glass' : '⚡ เปิดโหมดฉุกเฉิน Break-Glass (172.18.0.1:3100)'}
          </button>
        </div>
      </div>

      <div class="kpis" style="margin-bottom:14px">
        <div class="kpi">
          <span class="eyebrow">สถานะฐานข้อมูล</span>
          <strong>${s.database_mode === 'postgresql' ? 'PostgreSQL 16' : 'Local Store'}</strong>
          <span class="sub">ตาราง system_settings & transaction_logs</span>
        </div>
        <div class="kpi">
          <span class="eyebrow">โหมดการยืนยันตัวตน</span>
          <strong>${s.ciam_enabled ? 'Central IAM SSO + Local' : 'Local / Admin Login'}</strong>
          <span class="sub">${s.require_login ? 'บังคับล็อกอินก่อนเข้าใช้งาน' : 'โหมดพัฒนา'}</span>
        </div>
        <div class="kpi">
          <span class="eyebrow">โหมดฉุกเฉิน (Break-Glass)</span>
          <strong>${s.break_glass_enabled ? '🚨 เปิดใช้งานอยู่' : 'ปกติ (ปิด)'}</strong>
          <span class="sub">${s.break_glass_url || 'http://172.18.0.1:3100'}</span>
        </div>
        <div class="kpi">
          <span class="eyebrow">ประวัติความปลอดภัย (Audit Trail)</span>
          <strong>${auditLogs.length} รายการ</strong>
          <span class="sub">${s.last_directory_sync_at ? 'ซิงค์ล่าสุด: ' + new Date(s.last_directory_sync_at).toLocaleString('th-TH') : 'พร้อมบันทึกอัตโนมัติ'}</span>
        </div>
      </div>

      <form id="ciamConfigForm">
        <div class="apex-settings-grid">
          <!-- Card 1: Central IAM SSO -->
          <div class="card">
            <div class="card-head">
              <div>
                <h2>1. การเชื่อมต่อ Window Asia Central IAM (CIAM v2.9.0)</h2>
                <span class="sub">OAuth2 / OIDC + PKCE (S256) · เก็บลงตาราง <code>system_settings</code> (Zero .env)</span>
              </div>
            </div>
            <div class="form-grid" style="margin-top:10px">
              <label>CIAM Issuer URL
                <input type="url" name="ciam_issuer_url" value="${s.ciam_issuer_url || 'https://ciam.windowasia.com'}" required>
              </label>
              <label>Spoke App Code
                <input type="text" name="app_code" value="${s.app_code || 'apex'}" readonly>
              </label>
              <label>Production Domain
                <input type="url" name="app_domain" value="${s.app_domain || 'https://apex.windowasia.com'}">
              </label>
              <label>OAuth2 Client ID
                <input type="text" name="ciam_client_id" value="${s.ciam_client_id || 'apex-spoke-client'}">
              </label>
              <label>OAuth2 Client Secret
                <input type="password" name="ciam_client_secret" placeholder="${s.ciam_client_secret_masked || 'กรอก Client Secret จากระบบ CIAM'}">
              </label>
              <label>SSO Callback URI
                <input type="url" name="ciam_redirect_uri" value="${s.ciam_redirect_uri || 'https://apex.windowasia.com/api/auth/sso/callback'}">
              </label>
              <label>Management API Key (Group C Directory Push)
                <input type="password" name="ciam_management_api_key" placeholder="${s.ciam_management_api_key_masked || 'กรอก Management API Key'}">
              </label>
              <label>Allowed CIAM Push IPs (Whitelist)
                <input type="text" name="ciam_allowed_ips" value="${s.ciam_allowed_ips || '157.173.219.153,127.0.0.1'}">
              </label>
              <label style="grid-column:1/-1">Break-Glass Emergency Auth URL
                <input type="url" name="break_glass_url" value="${s.break_glass_url || 'http://172.18.0.1:3100'}">
              </label>
              <label class="row" style="gap:8px;grid-column:1/-1;margin-top:4px">
                <input type="checkbox" name="ciam_enabled" ${s.ciam_enabled ? 'checked' : ''} style="width:18px;height:18px">
                <strong>เปิดใช้งานการล็อกอินผ่าน Central IAM SSO เป็นหลัก (Redirect ไปยัง ciam.windowasia.com)</strong>
              </label>
            </div>
          </div>

          <!-- Card 2: Login Security & AI Copilot -->
          <div class="card">
            <div class="card-head">
              <div>
                <h2>2. ตั้งค่าการล็อกอินผู้ดูแลระบบ & In-App AI Copilot</h2>
                <span class="sub">กำหนดรหัสผ่านผู้ดูแลระบบ (Local / Break-Glass) และตั้งค่า AI วิเคราะห์โครงการแบบ Read-Only</span>
              </div>
            </div>
            <div class="form-grid" style="margin-top:10px">
              <label style="grid-column:1/-1">เปลี่ยนรหัสผ่านผู้ดูแลระบบหลัก (Primary Admin U01 Password — PBKDF2-SHA256)
                <input type="password" name="admin_local_password" placeholder="เว้นว่างไว้หากไม่ต้องการเปลี่ยนรหัสผ่าน">
              </label>
              <label class="row" style="gap:8px;grid-column:1/-1">
                <input type="checkbox" name="require_login" ${s.require_login !== false ? 'checked' : ''} style="width:18px;height:18px">
                <strong>บังคับแสดงหน้าเข้าสู่ระบบ (Login Gate) ทุกครั้งก่อนเข้าใช้งาน</strong>
              </label>

              <hr style="grid-column:1/-1;border:0;border-top:1px solid var(--line);margin:8px 0">

              <label style="grid-column:1/-1">AI Copilot Provider Endpoint
                <input type="url" name="ai_provider_url" value="${s.ai_provider_url || 'https://api.openai.com/v1/chat/completions'}">
              </label>
              <label>AI Model Name
                <input type="text" name="ai_model_name" value="${s.ai_model_name || 'gpt-4o-mini'}">
              </label>
              <label>AI API Key (Zero-Training)
                <input type="password" name="ai_api_key" placeholder="${s.ai_api_key_masked || 'เว้นว่างเพื่อใช้โหมดวิเคราะห์อัตโนมัติในระบบ'}">
              </label>
              <label class="row" style="gap:8px;grid-column:1/-1">
                <input type="checkbox" name="ai_copilot_enabled" ${s.ai_copilot_enabled ? 'checked' : ''} style="width:18px;height:18px">
                <strong>เปิดใช้งานปุ่ม 🤖 AI วิเคราะห์โครงการ (Read-Only 100% · คัดกรอง PII อัตโนมัติ)</strong>
              </label>
            </div>
          </div>
        </div>

        <div class="card" style="margin-top:14px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px">
          <div>
            <strong>💾 บันทึกการตั้งค่าทั้งหมดลงฐานข้อมูล PostgreSQL (ตาราง <code>system_settings</code>)</strong>
            <div class="sub" id="ciamStatusMsg">${s.last_directory_sync_at ? 'ซิงค์ล่าสุด: ' + new Date(s.last_directory_sync_at).toLocaleString('th-TH') : 'พร้อมบันทึกการเปลี่ยนแปลง (รหัส Audit: CFG-01)'}</div>
          </div>
          <button type="submit" class="btn primary">💾 บันทึกการตั้งค่าระบบ (Save Settings)</button>
        </div>
      </form>

      <div class="card" style="margin-top:14px">
        <div class="card-head">
          <div>
            <h2>📜 ประวัติความปลอดภัยและการเข้าใช้งาน (ISO/IEC 27001:2022 Audit Trail — <code>transaction_logs</code>)</h2>
            <span class="sub">บันทึกเหตุการณ์ SSO-01..SSO-04, CFG-01, SYNC-01, BG-01..BG-02 และ DATA-DELETE</span>
          </div>
          <button type="button" class="btn sm" id="btnRefreshAuditLogs">🔄 รีเฟรชประวัติ</button>
        </div>
        <div class="tablewrap" style="margin-top:10px;max-height:360px;overflow-y:auto">
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
                    <td><span class="pill ${String(l.event_code).includes('04') || String(l.event_code).includes('02') || String(l.event_code).includes('DENY') ? 'bad' : String(l.event_code).startsWith('BG') ? 'warn' : 'acc'} mono">${l.event_code}</span></td>
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
      </div>
    `;

    const form = container.querySelector('#ciamConfigForm');
    form?.addEventListener('submit', async e => {
      e.preventDefault();
      const fd = new FormData(form);
      const body = Object.fromEntries(fd.entries());
      body.ciam_enabled = Boolean(form.querySelector('[name=ciam_enabled]')?.checked);
      body.require_login = Boolean(form.querySelector('[name=require_login]')?.checked);
      body.ai_copilot_enabled = Boolean(form.querySelector('[name=ai_copilot_enabled]')?.checked);

      const res = await fetch('/api/settings/ciam-sso', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const out = await res.json();
      if (typeof window.toast === 'function') window.toast(out.message || 'บันทึกการตั้งค่าสำเร็จ');
      await fetchSessionInfo();
      await renderFullSettingsPage(container);
      syncCopilotButtonVisibility();
    });

    container.querySelector('#btnTestCiam')?.addEventListener('click', async () => {
      const msgEl = container.querySelector('#ciamStatusMsg');
      if (msgEl) msgEl.textContent = 'กำลังทดสอบการเชื่อมต่อ OIDC Discovery...';
      const res = await fetch('/api/settings/ciam-sso/test', { method: 'POST' });
      const out = await res.json();
      if (msgEl) msgEl.textContent = out.message || `เชื่อมต่อสำเร็จ: ${out.issuer || out.discovery_url}`;
      if (typeof window.toast === 'function') window.toast(out.message || 'ทดสอบ OIDC สำเร็จ');
    });

    container.querySelector('#btnSyncCiamNow')?.addEventListener('click', async () => {
      const res = await fetch('/api/settings/ciam-sso/sync-now', { method: 'POST' });
      const out = await res.json();
      if (typeof window.toast === 'function') window.toast(out.message || 'ซิงค์ข้อมูลสำเร็จ');
      await renderFullSettingsPage(container);
    });

    container.querySelector('#btnToggleBreakGlass')?.addEventListener('click', async () => {
      const nextState = !s.break_glass_enabled;
      const res = await fetch('/api/auth/sso/break-glass', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: nextState, reason: 'Admin manual toggle from APEX Settings UI' })
      });
      if (res.ok) {
        if (typeof window.toast === 'function') {
          window.toast(nextState ? 'เปิดโหมดฉุกเฉิน Break-Glass (BG-01) แล้ว' : 'ปิดโหมดฉุกเฉิน Break-Glass (BG-02) แล้ว');
        }
        await renderFullSettingsPage(container);
      }
    });

    container.querySelector('#btnRefreshAuditLogs')?.addEventListener('click', async () => {
      await renderFullSettingsPage(container);
    });
  }

  // Group E: Read-Only In-App AI Copilot Floating Widget
  function initCopilotWidget() {
    if (document.getElementById('apex-copilot-fab')) return;
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
        สวัสดีครับ! กดปุ่มถาม AI ด้านล่าง หรือพิมพ์คำถามเกี่ยวกับความคืบหน้าโครงการ ช่องเปิด และ NCR ได้เลยครับ
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

  window.addEventListener('DOMContentLoaded', async () => {
    injectSecurityStyles();
    await fetchSessionInfo();
    renderLoginOverlay();
    injectSidebarAndTopBar();
    initCopilotWidget();
  });
})();
