/**
 * APEX (apex.windowasia.com) - Track A: Enterprise Login Gate, Top Session Bar,
 * Dedicated System Settings View (#v-settings), Central IAM v2.9.0 Admin UI,
 * ISO/IEC 27001:2022 Audit Log Viewer & Read-Only AI Copilot
 */
(function initApexSecurityAndCopilotUI() {
  let ciamSettings = null;
  let sessionInfo = null;
  let ssoConfig = null;
  let auditLogs = [];
  let copilotOpen = false;
  let handling401 = false;

  const esc = v =>
    String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

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
      .apex-pwd-modal-overlay {
        position: fixed;
        inset: 0;
        background: rgba(4, 9, 16, 0.88);
        backdrop-filter: blur(8px);
        z-index: 100000;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 16px;
      }
      .apex-pwd-modal-card {
        background: #0d1522;
        border: 1px solid #23354d;
        border-radius: 18px;
        padding: 26px;
        max-width: 440px;
        width: 100%;
        color: #f0f6fc;
        box-shadow: 0 25px 60px rgba(0,0,0,0.65);
        font-family: inherit;
      }
      .apex-pwd-checklist {
        background: #070d16;
        border: 1px solid #1c2a3d;
        border-radius: 10px;
        padding: 12px 14px;
        margin: 12px 0 16px;
        font-size: 11.5px;
        line-height: 1.6;
      }
      .apex-pwd-check-item {
        display: flex;
        align-items: center;
        gap: 6px;
        color: #8b9bb0;
      }
      .apex-pwd-check-item.valid {
        color: #3fb950;
        font-weight: 600;
      }
      .apex-settings-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
        gap: 14px;
        margin-top: 12px;
      }
      .apex-breakglass-banner {
        background: rgba(245, 158, 11, 0.14);
        border: 1px solid rgba(245, 158, 11, 0.45);
        color: #fcd34d;
        padding: 10px 12px;
        border-radius: 8px;
        font-size: 12px;
        margin-bottom: 14px;
        line-height: 1.5;
      }
      .apex-sso-desktop {
        display: block;
      }
      .apex-sso-mobile {
        display: none;
      }
      @media (max-width: 767px) {
        .apex-sso-desktop {
          display: none;
        }
        .apex-sso-mobile {
          display: block;
          margin-top: 12px;
        }
      }
      .apex-pwd-wrap {
        position: relative;
        display: flex;
        align-items: center;
      }
      .apex-pwd-wrap input {
        padding-right: 40px !important;
      }
      .apex-pwd-toggle {
        position: absolute;
        right: 8px;
        background: transparent;
        border: none;
        color: #8b9bb0;
        cursor: pointer;
        font-size: 15px;
        padding: 4px 6px;
        line-height: 1;
      }
      .apex-pwd-toggle:hover {
        color: #f0f6fc;
      }
      .apex-modal-head {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 10px;
      }
      .apex-modal-close {
        background: transparent;
        border: 1px solid #28364a;
        color: #8b9bb0;
        border-radius: 8px;
        cursor: pointer;
        padding: 4px 10px;
        font-size: 13px;
      }
      .apex-modal-close:hover {
        color: #f0f6fc;
        border-color: #4f6482;
      }
    `;
    document.head.appendChild(style);
  }

  function bindPasswordToggles(rootEl) {
    if (!rootEl) return;
    rootEl.querySelectorAll('.apex-pwd-toggle').forEach(btn => {
      btn.addEventListener('click', () => {
        const targetId = btn.getAttribute('data-pwd-target');
        const input = targetId ? rootEl.querySelector(`#${targetId}`) : btn.previousElementSibling;
        if (!input) return;
        const nextType = input.type === 'password' ? 'text' : 'password';
        input.type = nextType;
        btn.setAttribute('aria-label', nextType === 'text' ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน');
        btn.textContent = nextType === 'text' ? '🙈' : '👁️';
      });
    });
  }

  async function fetchSessionInfo() {
    try {
      const [sessRes, cfgRes] = await Promise.all([
        fetch('/api/auth/session'),
        fetch('/api/auth/sso/config').catch(() => null)
      ]);
      if (cfgRes && cfgRes.ok) {
        ssoConfig = await cfgRes.json();
      }
      if (sessRes.ok) {
        sessionInfo = await sessRes.json();
        return sessionInfo;
      }
    } catch (_) {}
    return null;
  }

  async function handleUnauthorizedRedirect() {
    if (handling401) return;
    handling401 = true;
    const base = ssoConfig?.ciam_base_url || ciamSettings?.ciam_issuer_url || 'https://ciam.windowasia.com';
    const portalFallback = ciamSettings?.ciam_portal_url || `${String(base).replace(/\/+$/, '')}/portal`;
    const ssoActive = Boolean(ssoConfig?.sso_enabled ?? sessionInfo?.ciam_enabled);
    const bgActive = Boolean(ssoConfig?.break_glass_active ?? sessionInfo?.break_glass_enabled);

    if (ssoActive && !bgActive) {
      window.location.href = portalFallback;
      return;
    }

    await fetchSessionInfo();
    if (sessionInfo) sessionInfo.authenticated = false;
    renderLoginOverlay();
    setTimeout(() => {
      handling401 = false;
    }, 1500);
  }
  window.__APEX_ON_401__ = handleUnauthorizedRedirect;

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
  // 1. FULL-SCREEN ENTERPRISE LOGIN GATE (CIAM Spec §5.2 Responsive + State-Driven)
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
    const loginRenderTs = Date.now();
    const ssoEnabled = Boolean(ssoConfig?.sso_enabled ?? sessionInfo?.ciam_enabled);
    const breakGlassActive = Boolean(ssoConfig?.break_glass_active ?? sessionInfo?.break_glass_enabled);
    const ssoBtnLabel = esc(
      ssoConfig?.login_button_label || 'เข้าสู่ระบบด้วย Window Asia Central IAM (SSO)'
    );
    const showSso = ssoEnabled && !breakGlassActive;

    overlay.innerHTML = `
      <div class="apex-login-card">
        <div class="apex-login-badge">🛡️ Window Asia Public Co., Ltd. · ISO/IEC 27001:2022</div>
        <h1>เข้าสู่ระบบ APEX</h1>
        <span class="sub">ระบบควบคุมงานติดตั้งประตู-หน้าต่าง (S1–S8) · <code>apex.windowasia.com</code></span>

        ${
          breakGlassActive
            ? `<div class="apex-breakglass-banner">
                 ⚠️ <strong>โหมดฉุกเฉิน (Break-Glass Mode) กำลังทำงาน</strong><br>
                 การล็อกอินผ่าน Central IAM SSO ถูกระงับชั่วคราว กรุณาเข้าสู่ระบบด้วย Local Account หรือรหัสพนักงาน (AD Gateway)
               </div>`
            : ''
        }

        <div id="apexLoginError" class="apex-login-error" hidden></div>

        ${
          showSso
            ? `<div class="apex-sso-desktop">
                 <button type="button" class="apex-sso-btn" id="btnLoginCiamSso">
                   🔐 ${ssoBtnLabel}
                 </button>
                 <div class="apex-login-divider">หรือเข้าสู่ระบบด้วยบัญชีภายในระบบ / Non-AD</div>
               </div>`
            : ''
        }

        <form id="apexLocalLoginForm">
          <!-- Layer 2: In-App Decoy Honeypot Trap (Spec v2.12.0 หมวด F.3) -->
          <div style="position:absolute;left:-9999px;opacity:0;height:0;width:0;overflow:hidden;pointer-events:none;" aria-hidden="true" tabindex="-1">
            <input type="text" name="corporate_fax" id="apexLoginCorporateFax" tabindex="-1" autocomplete="off">
            <input type="text" name="security_honey" id="apexLoginSecurityHoney" tabindex="-1" autocomplete="off">
          </div>

          <label class="apex-login-field">
            <span>Username, อีเมล หรือ รหัสผู้ใช้งาน</span>
            <input type="text" name="identifier" id="apexLoginIdentifier" placeholder="เช่น admin, somchai.p หรืออีเมลองค์กร" required autocomplete="username">
          </label>
          <label class="apex-login-field">
            <span>รหัสผ่าน (Password)</span>
            <div class="apex-pwd-wrap">
              <input type="password" name="password" id="apexLoginPassword" value="" placeholder="กรอกรหัสผ่านของคุณ" required autocomplete="current-password">
              <button type="button" class="apex-pwd-toggle" data-pwd-target="apexLoginPassword" aria-label="แสดงรหัสผ่าน">👁️</button>
            </div>
          </label>
          <button type="submit" class="apex-login-submit" id="btnApexLoginSubmit">
            เข้าสู่ระบบ (Sign In) →
          </button>
        </form>

        <button type="button" class="btn sm" id="btnOpenFirstTimeRegister" style="width:100%;margin-top:10px;justify-content:center;background:#162235;color:#cbd5e1;border:1px solid #2b3e57">
          📝 ลงทะเบียนเข้าใช้งานครั้งแรก / ยืนยันรหัส OTP (สำหรับผู้รับเหมา &amp; บัญชี Local)
        </button>

        ${
          showSso
            ? `<div class="apex-sso-mobile">
                 <div class="apex-login-divider">หรือเข้าสู่ระบบผ่านระบบกลางองค์กร</div>
                 <button type="button" class="apex-sso-btn" id="btnLoginCiamSsoMobile">
                   🔐 ${ssoBtnLabel}
                 </button>
               </div>`
            : ''
        }

        <div class="apex-login-foot">
          <span>🔒 PKCE (S256) · Inactive Guard (SSO-04)</span>
          <span>DB: ${sessionInfo?.database_mode === 'postgresql' ? 'PostgreSQL 16' : 'Local Store'}</span>
        </div>
      </div>
    `;

    bindPasswordToggles(overlay);

    overlay.querySelectorAll('.apex-sso-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        window.location.href = '/api/auth/sso/login';
      });
    });

    overlay.querySelector('#btnOpenFirstTimeRegister')?.addEventListener('click', () => {
      const currentId = overlay.querySelector('#apexLoginIdentifier')?.value || '';
      renderFirstTimeRegistrationModal({ username: currentId });
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
        const corporate_fax = overlay.querySelector('#apexLoginCorporateFax')?.value || undefined;
        const security_honey = overlay.querySelector('#apexLoginSecurityHoney')?.value || undefined;

        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            identifier,
            password,
            corporate_fax,
            security_honey,
            form_render_ts: loginRenderTs
          })
        });
        const out = await res.json();
        if (!res.ok) {
          if (res.status === 403 && out.error === 'registration_required') {
            if (submitBtn) {
              submitBtn.disabled = false;
              submitBtn.textContent = 'เข้าสู่ระบบ (Sign In) →';
            }
            renderFirstTimeRegistrationModal({
              username: out.username || identifier,
              notice: out.message
            });
            return;
          }
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

        if (out.otp_required) {
          overlay.hidden = true;
          renderLoginOtpModal(out.identifier || identifier, out.masked_email || '', () => {
            window.location.reload();
          });
          return;
        }

        // Check if 90-day password rotation applies (Spec v2.12.0 หมวด G - Local Account Only)
        if (out.must_change_password) {
          overlay.hidden = true;
          renderForcedPasswordChangeModal(
            out.user,
            out.password_days_left,
            () => {
              window.location.reload();
            },
            { forced: true }
          );
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

  function renderComplexityChecklistHtml() {
    return `
      <div class="apex-pwd-checklist">
        <div style="font-weight:600;color:#c9d6e3;margin-bottom:4px">ข้อกำหนดความปลอดภัยของรหัสผ่าน (Complexity):</div>
        <div data-chk="len" class="apex-pwd-check-item"><span>•</span> ความยาว 8 ถึง 16 ตัวอักษร</div>
        <div data-chk="upper" class="apex-pwd-check-item"><span>•</span> ตัวอักษรพิมพ์ใหญ่ (A-Z) อย่างน้อย 1 ตัว</div>
        <div data-chk="lower" class="apex-pwd-check-item"><span>•</span> ตัวอักษรพิมพ์เล็ก (a-z) อย่างน้อย 1 ตัว</div>
        <div data-chk="digit" class="apex-pwd-check-item"><span>•</span> ตัวเลข (0-9) อย่างน้อย 1 ตัว</div>
        <div data-chk="special" class="apex-pwd-check-item"><span>•</span> อักขระพิเศษ (!@#$%^&*...) อย่างน้อย 1 ตัว</div>
        <div data-chk="nouser" class="apex-pwd-check-item"><span>•</span> ไม่มีชื่อผู้ใช้ (Username) ในรหัสผ่าน</div>
      </div>
    `;
  }

  function evaluateComplexityChecklist(modal, pwd, confirmPwd, usernameRaw, extraReady) {
    const p = pwd || '';
    const c = confirmPwd || '';
    const u = String(usernameRaw || '').trim();
    const checks = {
      len: p.length >= 8 && p.length <= 16,
      upper: /[A-Z]/.test(p),
      lower: /[a-z]/.test(p),
      digit: /[0-9]/.test(p),
      special: /[!@#$%^&*()_+\-=\[\]{}|;:,.<>?/~`]/.test(p),
      nouser: !u || u.length < 3 || !p.toLowerCase().includes(u.toLowerCase())
    };
    Object.entries(checks).forEach(([k, valid]) => {
      const el = modal.querySelector(`[data-chk="${k}"]`);
      if (el) el.className = 'apex-pwd-check-item' + (valid ? ' valid' : '');
    });
    return Boolean(
      checks.len &&
        checks.upper &&
        checks.lower &&
        checks.digit &&
        checks.special &&
        checks.nouser &&
        p &&
        p === c &&
        extraReady
    );
  }

  function renderFirstTimeRegistrationModal(prefill = {}) {
    let modal = document.getElementById('apex-first-register-modal');
    if (modal) modal.remove();

    modal = document.createElement('div');
    modal.id = 'apex-first-register-modal';
    modal.className = 'apex-pwd-modal-overlay noprint';
    const modalRenderTs = Date.now();

    modal.innerHTML = `
      <div class="apex-pwd-modal-card">
        <div class="apex-modal-head" style="margin-bottom:8px">
          <div style="display:flex;align-items:center;gap:8px">
            <span style="font-size:22px">📝</span>
            <h2 style="font-size:16px;font-weight:700;margin:0;color:#f0f6fc">ลงทะเบียนเข้าใช้งานครั้งแรก &amp; ตั้งรหัสผ่าน</h2>
          </div>
          <button type="button" class="apex-modal-close" id="btnCloseRegModal" aria-label="ปิด">✕ ปิด</button>
        </div>
        <p style="font-size:12px;color:#8b9bb0;margin:0 0 12px;line-height:1.5">
          สำหรับผู้รับเหมาช่วง ลูกค้า หรือพนักงานที่ไม่มีบัญชี AD — กรอก Username หรืออีเมล พร้อมรหัสเชิญ/OTP 6 หลัก เพื่อตั้งรหัสผ่านเข้าใช้งานครั้งแรก
        </p>

        <div id="apexRegError" class="apex-login-error" ${prefill.notice ? '' : 'hidden'}>${esc(prefill.notice || '')}</div>
        <div id="apexRegSuccess" style="background:rgba(63,185,80,0.12);border:1px solid rgba(63,185,80,0.45);color:#7ee787;padding:8px 10px;border-radius:8px;font-size:12px;margin-bottom:10px" hidden></div>

        ${renderComplexityChecklistHtml()}

        <form id="apexFirstRegForm">
          <label class="apex-login-field">
            <span>Username หรือ อีเมล *</span>
            <input type="text" id="apexRegIdentifier" required value="${esc(prefill.username || '')}" placeholder="เช่น contractor01 หรืออีเมลที่ลงทะเบียน">
          </label>
          <div class="apex-login-field">
            <span>รหัสเชิญ หรือ รหัส OTP 6 หลัก *</span>
            <div style="display:flex;gap:8px;align-items:center">
              <input type="text" id="apexRegTokenOrOtp" required value="${esc(prefill.token || '')}" placeholder="รหัส OTP 6 หลัก หรือ Invite Token" style="flex:1">
              <button type="button" class="btn sm" id="btnRegRequestOtp" style="white-space:nowrap">📨 ขอรหัส OTP</button>
            </div>
          </div>
          <label class="apex-login-field">
            <span>กำหนดรหัสผ่านใหม่ (New Password) *</span>
            <div class="apex-pwd-wrap">
              <input type="password" id="apexRegNewPwd" maxlength="16" required placeholder="8-16 ตัวอักษร" autocomplete="new-password">
              <button type="button" class="apex-pwd-toggle" data-pwd-target="apexRegNewPwd" aria-label="แสดงรหัสผ่าน">👁️</button>
            </div>
          </label>
          <label class="apex-login-field">
            <span>ยืนยันรหัสผ่านใหม่ (Confirm Password) *</span>
            <div class="apex-pwd-wrap">
              <input type="password" id="apexRegConfirmPwd" maxlength="16" required placeholder="กรอกรหัสผ่านใหม่อีกครั้ง" autocomplete="new-password">
              <button type="button" class="apex-pwd-toggle" data-pwd-target="apexRegConfirmPwd" aria-label="แสดงรหัสผ่าน">👁️</button>
            </div>
          </label>
          <button type="submit" class="apex-login-submit" id="btnSubmitFirstReg" disabled style="opacity:0.55">
            ยืนยันลงทะเบียนและเข้าสู่ระบบ →
          </button>
        </form>
      </div>
    `;

    document.body.appendChild(modal);
    bindPasswordToggles(modal);

    modal.querySelector('#btnCloseRegModal')?.addEventListener('click', () => modal.remove());

    const idInput = modal.querySelector('#apexRegIdentifier');
    const tokInput = modal.querySelector('#apexRegTokenOrOtp');
    const pwdInput = modal.querySelector('#apexRegNewPwd');
    const confirmInput = modal.querySelector('#apexRegConfirmPwd');
    const submitBtn = modal.querySelector('#btnSubmitFirstReg');
    const errBox = modal.querySelector('#apexRegError');
    const okBox = modal.querySelector('#apexRegSuccess');

    function syncRegChecklist() {
      const ok = evaluateComplexityChecklist(
        modal,
        pwdInput.value,
        confirmInput.value,
        idInput.value,
        Boolean(idInput.value.trim() && tokInput.value.trim())
      );
      submitBtn.disabled = !ok;
      submitBtn.style.opacity = ok ? '1' : '0.55';
    }
    [idInput, tokInput, pwdInput, confirmInput].forEach(el =>
      el.addEventListener('input', syncRegChecklist)
    );
    syncRegChecklist();

    modal.querySelector('#btnRegRequestOtp')?.addEventListener('click', async () => {
      errBox.hidden = true;
      okBox.hidden = true;
      const identifier = idInput.value.trim();
      if (!identifier) {
        errBox.textContent = 'กรุณากรอก Username หรืออีเมลก่อนขอรหัส OTP';
        errBox.hidden = false;
        return;
      }
      const reqBtn = modal.querySelector('#btnRegRequestOtp');
      reqBtn.disabled = true;
      reqBtn.textContent = 'กำลังส่ง...';
      try {
        const res = await fetch('/api/auth/otp/request', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ identifier, purpose: 'register' })
        });
        const out = await res.json();
        if (!res.ok) {
          errBox.textContent = out.message || 'ไม่สามารถส่งรหัส OTP ได้';
          errBox.hidden = false;
        } else {
          okBox.textContent = out.message || 'ส่งรหัส OTP 6 หลักแล้ว';
          okBox.hidden = false;
        }
      } catch (_) {
        errBox.textContent = 'เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์';
        errBox.hidden = false;
      } finally {
        reqBtn.disabled = false;
        reqBtn.textContent = '📨 ขอรหัส OTP';
      }
    });

    modal.querySelector('#apexFirstRegForm').addEventListener('submit', async e => {
      e.preventDefault();
      errBox.hidden = true;
      okBox.hidden = true;
      submitBtn.disabled = true;
      submitBtn.textContent = 'กำลังลงทะเบียนและตรวจสอบรหัส...';

      try {
        const res = await fetch('/api/auth/register-first-time', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            identifier: idInput.value.trim(),
            token_or_otp: tokInput.value.trim(),
            new_password: pwdInput.value,
            form_render_ts: modalRenderTs
          })
        });
        const out = await res.json();
        if (!res.ok) {
          errBox.textContent = out.message || 'ลงทะเบียนไม่สำเร็จ';
          errBox.hidden = false;
          submitBtn.disabled = false;
          submitBtn.textContent = 'ยืนยันลงทะเบียนและเข้าสู่ระบบ →';
          return;
        }
        try {
          if (window.location.search.includes('register_token')) {
            window.history.replaceState({}, '', window.location.pathname);
          }
        } catch (_) {}
        modal.remove();
        window.location.reload();
      } catch (_) {
        errBox.textContent = 'เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์';
        errBox.hidden = false;
        submitBtn.disabled = false;
        submitBtn.textContent = 'ยืนยันลงทะเบียนและเข้าสู่ระบบ →';
      }
    });
  }

  function renderLoginOtpModal(identifier, maskedEmail, onDone) {
    let modal = document.getElementById('apex-login-otp-modal');
    if (modal) modal.remove();

    modal = document.createElement('div');
    modal.id = 'apex-login-otp-modal';
    modal.className = 'apex-pwd-modal-overlay noprint';

    modal.innerHTML = `
      <div class="apex-pwd-modal-card">
        <div class="apex-modal-head" style="margin-bottom:8px">
          <div style="display:flex;align-items:center;gap:8px">
            <span style="font-size:22px">🔐</span>
            <h2 style="font-size:16px;font-weight:700;margin:0;color:#f0f6fc">ยืนยันตัวตน 2 ชั้นด้วยรหัส OTP</h2>
          </div>
          <button type="button" class="apex-modal-close" id="btnCancelLoginOtp">← กลับ</button>
        </div>
        <p style="font-size:12px;color:#8b9bb0;margin:0 0 12px;line-height:1.5">
          ระบบได้ส่งรหัส OTP 6 หลักสำหรับบัญชี <code>${esc(identifier)}</code> ไปยัง ${maskedEmail ? `<code>${esc(maskedEmail)}</code> และ ` : ''}Telegram แล้ว (มีอายุ 5 นาที)
        </p>
        <div id="apexLoginOtpError" class="apex-login-error" hidden></div>
        <form id="apexLoginOtpForm">
          <label class="apex-login-field">
            <span>รหัส OTP 6 หลัก *</span>
            <input type="text" id="apexLoginOtpCode" maxlength="6" inputmode="numeric" required placeholder="กรอกรหัส 6 หลัก" style="text-align:center;font-size:18px;letter-spacing:6px">
          </label>
          <button type="submit" class="apex-login-submit" id="btnVerifyLoginOtp">ยืนยันรหัส OTP →</button>
        </form>
        <button type="button" class="btn sm" id="btnResendLoginOtp" style="width:100%;margin-top:10px;justify-content:center;background:#162235;color:#cbd5e1;border:1px solid #2b3e57">
          🔄 ขอรหัส OTP ใหม่
        </button>
      </div>
    `;

    document.body.appendChild(modal);
    const errBox = modal.querySelector('#apexLoginOtpError');
    const codeInput = modal.querySelector('#apexLoginOtpCode');
    const verifyBtn = modal.querySelector('#btnVerifyLoginOtp');

    modal.querySelector('#btnCancelLoginOtp')?.addEventListener('click', () => {
      modal.remove();
      renderLoginOverlay();
    });

    modal.querySelector('#btnResendLoginOtp')?.addEventListener('click', async () => {
      errBox.hidden = true;
      try {
        const res = await fetch('/api/auth/otp/request', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ identifier, purpose: 'login_2fa' })
        });
        const out = await res.json();
        if (!res.ok) {
          errBox.textContent = out.message || 'ไม่สามารถขอรหัส OTP ใหม่ได้';
          errBox.hidden = false;
        }
      } catch (_) {
        errBox.textContent = 'เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์';
        errBox.hidden = false;
      }
    });

    modal.querySelector('#apexLoginOtpForm')?.addEventListener('submit', async e => {
      e.preventDefault();
      errBox.hidden = true;
      verifyBtn.disabled = true;
      verifyBtn.textContent = 'กำลังตรวจสอบรหัส OTP...';

      try {
        const res = await fetch('/api/auth/otp/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ identifier, otp_code: codeInput.value.trim() })
        });
        const out = await res.json();
        if (!res.ok) {
          errBox.textContent = out.message || 'รหัส OTP ไม่ถูกต้อง';
          errBox.hidden = false;
          verifyBtn.disabled = false;
          verifyBtn.textContent = 'ยืนยันรหัส OTP →';
          return;
        }
        modal.remove();
        if (out.must_change_password) {
          renderForcedPasswordChangeModal(out.user, out.password_days_left, onDone, { forced: true });
          return;
        }
        if (typeof onDone === 'function') onDone();
      } catch (_) {
        errBox.textContent = 'เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์';
        errBox.hidden = false;
        verifyBtn.disabled = false;
        verifyBtn.textContent = 'ยืนยันรหัส OTP →';
      }
    });
  }

  function renderForcedPasswordChangeModal(user, daysLeft, onDone, options = {}) {
    const isForced = options.forced !== false;
    let modal = document.getElementById('apex-pwd-change-modal');
    if (modal) modal.remove();

    modal = document.createElement('div');
    modal.id = 'apex-pwd-change-modal';
    modal.className = 'apex-pwd-modal-overlay noprint';

    const titleText = isForced ? 'จำเป็นต้องเปลี่ยนรหัสผ่านใหม่' : 'เปลี่ยนรหัสผ่านบัญชีผู้ใช้';
    const descText = isForced
      ? `บัญชีท้องถิ่น (${esc(user?.name || user?.username || user?.id || 'Local User')}) ถึงกำหนดเปลี่ยนรหัสผ่านตามรอบความปลอดภัย 90 วัน (ISO 27001) กรุณาตั้งรหัสผ่านใหม่เพื่อเข้าใช้งาน`
      : `บัญชี ${esc(user?.name || user?.username || user?.id || '')} — รหัสผ่านใหม่จะมีผลบังคับใช้นาน 90 วันตามมาตรฐานความปลอดภัย`;

    modal.innerHTML = `
      <div class="apex-pwd-modal-card">
        <div class="apex-modal-head" style="margin-bottom:8px">
          <div style="display:flex;align-items:center;gap:8px">
            <span style="font-size:22px">${isForced ? '🔒' : '🔑'}</span>
            <h2 style="font-size:16px;font-weight:700;margin:0;color:#f0f6fc">${titleText}</h2>
          </div>
          ${!isForced ? '<button type="button" class="apex-modal-close" id="btnClosePwdModal" aria-label="ปิด">✕ ยกเลิก</button>' : ''}
        </div>
        <p style="font-size:12px;color:#8b9bb0;margin:0 0 12px;line-height:1.5">${descText}</p>

        <div id="apexPwdModalError" class="apex-login-error" hidden></div>

        ${renderComplexityChecklistHtml()}

        <form id="apexForcedPwdForm">
          <label class="apex-login-field">
            <span>รหัสผ่านเดิม (Current Password) *</span>
            <div class="apex-pwd-wrap">
              <input type="password" id="apexOldPassword" required placeholder="กรอกรหัสผ่านปัจจุบัน" autocomplete="current-password">
              <button type="button" class="apex-pwd-toggle" data-pwd-target="apexOldPassword" aria-label="แสดงรหัสผ่าน">👁️</button>
            </div>
          </label>
          <label class="apex-login-field">
            <span>รหัสผ่านใหม่ (New Password) *</span>
            <div class="apex-pwd-wrap">
              <input type="password" id="apexNewPassword" maxlength="16" required placeholder="8-16 ตัวอักษร" autocomplete="new-password">
              <button type="button" class="apex-pwd-toggle" data-pwd-target="apexNewPassword" aria-label="แสดงรหัสผ่าน">👁️</button>
            </div>
          </label>
          <label class="apex-login-field">
            <span>ยืนยันรหัสผ่านใหม่ (Confirm Password) *</span>
            <div class="apex-pwd-wrap">
              <input type="password" id="apexConfirmPassword" maxlength="16" required placeholder="กรอกรหัสผ่านใหม่อีกครั้ง" autocomplete="new-password">
              <button type="button" class="apex-pwd-toggle" data-pwd-target="apexConfirmPassword" aria-label="แสดงรหัสผ่าน">👁️</button>
            </div>
          </label>
          <button type="submit" class="apex-login-submit" id="btnSubmitNewPassword" disabled style="opacity:0.55">
            บันทึกรหัสผ่านใหม่ (มีอายุ 90 วัน) →
          </button>
        </form>
      </div>
    `;

    document.body.appendChild(modal);
    bindPasswordToggles(modal);

    modal.querySelector('#btnClosePwdModal')?.addEventListener('click', () => {
      modal.remove();
    });

    const oldPwdInput = modal.querySelector('#apexOldPassword');
    const newPwdInput = modal.querySelector('#apexNewPassword');
    const confirmPwdInput = modal.querySelector('#apexConfirmPassword');
    const submitBtn = modal.querySelector('#btnSubmitNewPassword');
    const errBox = modal.querySelector('#apexPwdModalError');
    const emailPrefix = user?.email && String(user.email).includes('@') ? String(user.email).split('@')[0] : '';
    const username = String(user?.username || user?.uid || emailPrefix || user?.id || '').trim();

    function updateChecklist() {
      const allValid = evaluateComplexityChecklist(
        modal,
        newPwdInput.value,
        confirmPwdInput.value,
        username,
        Boolean(oldPwdInput.value)
      );
      submitBtn.disabled = !allValid;
      submitBtn.style.opacity = allValid ? '1' : '0.55';
    }

    newPwdInput.addEventListener('input', updateChecklist);
    confirmPwdInput.addEventListener('input', updateChecklist);
    oldPwdInput.addEventListener('input', updateChecklist);

    modal.querySelector('#apexForcedPwdForm').addEventListener('submit', async e => {
      e.preventDefault();
      errBox.hidden = true;
      submitBtn.disabled = true;
      submitBtn.textContent = 'กำลังบันทึกรหัสผ่านใหม่...';

      try {
        const res = await fetch('/api/auth/local/change-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            old_password: oldPwdInput.value,
            new_password: newPwdInput.value
          })
        });
        const d = await res.json();
        if (!res.ok) {
          errBox.textContent = d.message || 'ไม่สามารถเปลี่ยนรหัสผ่านได้';
          errBox.hidden = false;
          submitBtn.disabled = false;
          submitBtn.textContent = 'บันทึกรหัสผ่านใหม่ (มีอายุ 90 วัน) →';
          return;
        }

        modal.remove();
        if (typeof window.toast === 'function') {
          window.toast('เปลี่ยนรหัสผ่านเรียบร้อยแล้ว (มีผลบังคับใช้ 90 วันตามมาตรฐาน ISO 27001)');
        } else if (isForced) {
          alert('เปลี่ยนรหัสผ่านเรียบร้อยแล้ว (มีผลบังคับใช้ 90 วันตามมาตรฐาน ISO 27001)');
        }
        if (typeof onDone === 'function') onDone();
      } catch (err) {
        errBox.textContent = 'เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์';
        errBox.hidden = false;
        submitBtn.disabled = false;
        submitBtn.textContent = 'บันทึกรหัสผ่านใหม่ (มีอายุ 90 วัน) →';
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
    const isLocalAuth = u.use_ad_auth === false || u.id === 'U01';

    topbar.innerHTML = `
      <div class="apex-topbar-left">
        <span class="pill acc">👤 ${esc(u.name || 'ผู้ดูแลระบบ')}</span>
        ${u.username ? `<span class="sub mono">@${esc(u.username)}</span>` : ''}
        <span class="pill">${esc(ROLE_TH[u.role] || u.role)}</span>
        <span class="pill">${isLocalAuth ? '🔑 Local' : '🔐 AD SSO'}</span>
        ${u.email ? `<span class="sub mono">${esc(u.email)}</span>` : ''}
        <span class="pill good" style="font-size:11.5px">🗄️ ${dbMode}</span>
      </div>
      <div class="apex-topbar-right">
        ${isLocalAuth ? '<button type="button" class="btn sm" id="btnTopChangePassword">🔑 เปลี่ยนรหัสผ่าน</button>' : ''}
        <button type="button" class="btn sm primary" id="btnTopOpenSettings">⚙️ ตั้งค่าระบบ & SSO</button>
        <button type="button" class="btn sm" id="btnTopLogout">🚪 ออกจากระบบ (Logout)</button>
      </div>
    `;

    topbar.querySelector('#btnTopChangePassword')?.addEventListener('click', () => {
      renderForcedPasswordChangeModal(
        u,
        90,
        () => {
          window.location.reload();
        },
        { forced: false }
      );
    });

    topbar.querySelector('#btnTopOpenSettings')?.addEventListener('click', () => {
      openSettingsView();
    });

    topbar.querySelector('#btnTopLogout')?.addEventListener('click', async () => {
      const clearActAs = () => {
        try {
          sessionStorage.removeItem('actAs');
        } catch (_) {}
      };
      const portalFallback = ciamSettings?.ciam_portal_url || 'https://ciam.windowasia.com/portal';
      try {
        const res = await fetch('/api/auth/sso/logout', { method: 'POST' });
        const out = await res.json().catch(() => null);
        clearActAs();
        if (out?.redirect_uri && out.redirect_uri !== '/login') {
          window.location.href = out.redirect_uri;
          return;
        }
        if (sessionInfo?.ciam_enabled) {
          window.location.href = portalFallback;
          return;
        }
      } catch (_) {
        clearActAs();
        if (sessionInfo?.ciam_enabled) {
          window.location.href = portalFallback;
          return;
        }
      }
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
              <label>สิทธิ์เริ่มต้นเมื่อสร้างบัญชีอัตโนมัติ (JIT Provision Role)
                <select name="ciam_auto_provision_group">
                  ${Object.entries(ROLE_TH)
                    .filter(([k]) => k !== 'admin' || s.ciam_auto_provision_group === 'admin')
                    .map(
                      ([k, th]) =>
                        `<option value="${k}" ${(s.ciam_auto_provision_group || 'viewer') === k ? 'selected' : ''}>${k} — ${th}</option>`
                    )
                    .join('')}
                </select>
              </label>
              <label>อายุ Session สูงสุด (นาที / Session TTL)
                <input type="number" name="ciam_session_ttl_minutes" min="15" max="10080" value="${Number(s.ciam_session_ttl_minutes || 480)}">
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

          <!-- Card 3: Telegram Bot & Email / OTP Notification Settings -->
          <div class="card" style="grid-column:1/-1">
            <div class="card-head">
              <div>
                <h2>3. ระบบแจ้งเตือน Telegram Bot, Email / SMTP และ OTP (ISO 27001 Alerts &amp; Onboarding)</h2>
                <span class="sub">ส่งลิงก์ลงทะเบียนครั้งแรก + รหัส OTP 6 หลักสำหรับผู้ใช้ External / Non-AD และแจ้งเตือนเหตุการณ์ความปลอดภัยลง Telegram</span>
              </div>
              <div class="row" style="gap:8px">
                <button type="button" class="btn sm" id="btnTestTelegram">📨 ทดสอบ Telegram</button>
                <button type="button" class="btn sm" id="btnTestEmail">✉️ ทดสอบ Email</button>
              </div>
            </div>
            <div class="form-grid" style="margin-top:10px">
              <label class="row" style="gap:8px;grid-column:1/-1">
                <input type="checkbox" name="telegram_enabled" ${s.telegram_enabled ? 'checked' : ''} style="width:18px;height:18px">
                <strong>เปิดใช้งานแจ้งเตือนผ่าน Telegram Bot (Audit Alerts, Login, User Invite/Register)</strong>
              </label>
              <label>Telegram Bot Token
                <input type="password" name="telegram_bot_token" placeholder="${esc(s.telegram_bot_token_masked || 'เช่น 123456:ABC-DEF... (เว้นว่างหากไม่เปลี่ยน)')}">
              </label>
              <label>Telegram Default Chat ID / Group ID
                <input type="text" name="telegram_chat_id" value="${esc(s.telegram_chat_id || '')}" placeholder="เช่น -1001234567890 หรือ 123456789">
              </label>
              <label class="row" style="gap:8px">
                <input type="checkbox" name="telegram_notify_login" ${s.telegram_notify_login !== false ? 'checked' : ''} style="width:18px;height:18px">
                <span>แจ้งเตือนเมื่อมีการเข้าสู่ระบบ (Login)</span>
              </label>
              <label class="row" style="gap:8px">
                <input type="checkbox" name="telegram_notify_user_provision" ${s.telegram_notify_user_provision !== false ? 'checked' : ''} style="width:18px;height:18px">
                <span>แจ้งเตือนเมื่อเชิญ/ลงทะเบียนผู้ใช้ใหม่</span>
              </label>
              <label class="row" style="gap:8px;grid-column:1/-1">
                <input type="checkbox" name="telegram_notify_security_alert" ${s.telegram_notify_security_alert !== false ? 'checked' : ''} style="width:18px;height:18px">
                <span>แจ้งเตือน Security Alerts ทันที (AD Blocked, Account Locked, OTP Fail, Break-Glass)</span>
              </label>

              <hr style="grid-column:1/-1;border:0;border-top:1px solid var(--line);margin:8px 0">

              <label class="row" style="gap:8px;grid-column:1/-1">
                <input type="checkbox" name="email_enabled" ${s.email_enabled ? 'checked' : ''} style="width:18px;height:18px">
                <strong>เปิดใช้งานส่ง Email อัตโนมัติ (Invite / OTP / External Notification)</strong>
              </label>
              <label>SMTP Host
                <input type="text" name="smtp_host" value="${esc(s.smtp_host || '')}" placeholder="เช่น smtp.office365.com หรือ smtp.gmail.com">
              </label>
              <label>SMTP Port
                <input type="number" name="smtp_port" min="1" max="65535" value="${Number(s.smtp_port || 587)}">
              </label>
              <label>SMTP Username
                <input type="text" name="smtp_user" value="${esc(s.smtp_user || '')}" placeholder="noreply@windowasia.com">
              </label>
              <label>SMTP Password / App Password
                <input type="password" name="smtp_password" placeholder="${esc(s.smtp_password_masked || 'เว้นว่างหากไม่ต้องการเปลี่ยนรหัส SMTP')}">
              </label>
              <label>ชื่อ/อีเมลผู้ส่ง (From Address)
                <input type="text" name="smtp_from" value="${esc(s.smtp_from || 'APEX Security <noreply@windowasia.com>')}">
              </label>
              <label>Email Webhook URL (ทางเลือก — ส่งแทน/เสริม SMTP)
                <input type="url" name="email_webhook_url" value="${esc(s.email_webhook_url || '')}" placeholder="https://relay.windowasia.com/hooks/email">
              </label>
              <label class="row" style="gap:8px;grid-column:1/-1">
                <input type="checkbox" name="login_otp_external" ${s.login_otp_external ? 'checked' : ''} style="width:18px;height:18px">
                <strong>บังคับตรวจ 2FA OTP ทาง Email/Telegram ทุกครั้งเมื่อผู้รับเหมา/ลูกค้า (External) เข้าสู่ระบบ</strong>
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
      [
        'ciam_enabled',
        'require_login',
        'ai_copilot_enabled',
        'telegram_enabled',
        'telegram_notify_login',
        'telegram_notify_user_provision',
        'telegram_notify_security_alert',
        'email_enabled',
        'login_otp_external'
      ].forEach(k => {
        body[k] = Boolean(form.querySelector(`[name=${k}]`)?.checked);
      });

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

    container.querySelector('#btnTestTelegram')?.addEventListener('click', async () => {
      const msgEl = container.querySelector('#ciamStatusMsg');
      const chatId = form?.querySelector('[name=telegram_chat_id]')?.value?.trim() || undefined;
      if (msgEl) msgEl.textContent = 'กำลังส่งข้อความทดสอบไปยัง Telegram Bot...';
      const res = await fetch('/api/settings/notifications/test-telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId })
      });
      const out = await res.json();
      if (msgEl) msgEl.textContent = out.message || 'ทดสอบ Telegram สำเร็จ';
      if (typeof window.toast === 'function') window.toast(out.message || 'ทดสอบ Telegram เสร็จสิ้น');
    });

    container.querySelector('#btnTestEmail')?.addEventListener('click', async () => {
      const msgEl = container.querySelector('#ciamStatusMsg');
      const to = window.prompt('ระบุอีเมลปลายทางสำหรับทดสอบส่งแจ้งเตือน (ปล่อยว่างเพื่อใช้อีเมลของคุณ):', sessionInfo?.user?.email || '');
      if (to === null) return;
      if (msgEl) msgEl.textContent = 'กำลังส่งอีเมลทดสอบ...';
      const res = await fetch('/api/settings/notifications/test-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: to.trim() || undefined })
      });
      const out = await res.json();
      if (msgEl) msgEl.textContent = out.message || 'ทดสอบ Email สำเร็จ';
      if (typeof window.toast === 'function') window.toast(out.message || 'ทดสอบ Email เสร็จสิ้น');
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
    const searchParams = new URLSearchParams(window.location.search || '');
    if (
      searchParams.has('code') &&
      searchParams.has('state') &&
      !window.location.pathname.startsWith('/api/auth/sso/callback')
    ) {
      window.location.replace('/api/auth/sso/callback' + window.location.search);
      return;
    }
    injectSecurityStyles();
    await fetchSessionInfo();
    renderLoginOverlay();
    injectSidebarAndTopBar();
    initCopilotWidget();
    const urlParams = new URLSearchParams(window.location.search || '');
    if (!sessionInfo?.authenticated && urlParams.has('register_token')) {
      renderFirstTimeRegistrationModal({
        username: urlParams.get('username') || '',
        token: urlParams.get('register_token') || '',
        notice: 'กรุณาตั้งรหัสผ่านใหม่เพื่อยืนยันตัวตนและเปิดใช้งานบัญชีครั้งแรก'
      });
    }
    if (
      sessionInfo?.authenticated &&
      sessionInfo?.user?.must_change_password &&
      sessionInfo?.user?.use_ad_auth === false
    ) {
      renderForcedPasswordChangeModal(
        sessionInfo.user,
        0,
        () => window.location.reload(),
        { forced: true }
      );
    }
  });
})();
