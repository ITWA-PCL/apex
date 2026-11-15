# HANDOFF.md — Session Handoff & Synchronization Log (APEX)

> **คำแนะนำสำหรับ AI Agent และทีมพัฒนา (คุณ & CFO) เมื่อกลับมาทำงานครั้งต่อไป:**
> 1. **ตอนเริ่มงาน:** เปิดโปรเจกต์ที่โฟลเดอร์ **`D:\Python\APEX`** แล้วอ่านไฟล์ `HANDOFF.md`, `MEMORY.md`, `TASKS.md` (และ `TASK.md`), `PRD.md`, `AGENTS.md` ตามลำดับเสมอ
> 2. **ตอนจบงาน:** รัน `node scripts/verify-local.js` (ต้อง 0 Errors) และ `scripts/cleanup-cache.ps1` อัปเดตสถานะใน `TASKS.md` / `HANDOFF.md` แล้วสั่ง `git commit` & `git push` เข้า Branch ของตัวเองเสมอ

---

## Latest Handoff Status (จุดพักงานล่าสุด — พร้อมกลับมาทำต่อได้ทันที)

- **วันที่ / เวลาบันทึกส่งมอบ:** `2026-11-15 11:12 (+07:00)`
- **ผู้ส่งมอบงานล่าสุด:** Lead Security & Core Architect (คุณ — Track A ร่วมกับ Antigravity AI)
- **ชื่อโปรเจกต์หลัก:** **APEX** (`https://apex.windowasia.com` — ระบบควบคุมงานติดตั้งประตู-หน้าต่าง)
- **โฟลเดอร์หลักของโปรเจกต์บนเครื่อง Local (ทั้งเครื่องคุณและเครื่อง CFO):** **`D:\Python\APEX`**
- **โฟลเดอร์ Production บน Hostinger VPS:** **`/var/www/Apex`**
- **Git Remote ของบริษัท:** `https://github.com/ITWA-PCL/apex.git`
- **Git Branch & Commit ล่าสุด:**
  - Branch งาน Security ล่าสุดของคุณ (Track A): **`Sec1`** (ต่อยอดจาก `8477d45` และ `origin/main` ที่ `4a92ab1`)
  - **แพตช์ล่าสุดบน `Sec1` (Enterprise User Management, Login UX, Session Persistence & Group C/D Sync):**
    - `app/src/db/postgres.js`: เพิ่มตาราง `active_sessions` (พร้อม fallback store), ฟังก์ชัน `saveSession`/`getSession`/`deleteSession`/`deleteUserSessions`, ค่าเริ่มต้น `ciam_auto_provision_group` (`'viewer'`) และ `ciam_session_ttl_minutes` (`'480'`), และฟิลด์ `username`/`department`/`status_origin` ใน `U01`
    - `app/src/security/rbac.js`: รองรับกู้คืน Session จาก PostgreSQL/Fallback ผ่าน `resolveRequestUser`, เพิ่ม `findMatchingUser` & `revokeUserSessions`, และเปิดเผย `has_password` ใน `sanitizeDocForResponse` โดยไม่รั่ว `password_hash`
    - `app/src/security/ciam.js`: เพิ่ม `; Secure` cookie flag บน HTTPS, ปรับ `/api/auth/login` รองรับ `username` case-insensitive + Break-Glass AD Gateway fallback + server-side `lastSeen`/`last_login_at`, ปรับ `change-password` ตรวจเทียบ `username`, ปรับ Group C (`/api/v1/directory/accounts*`) ตาม Spec C.1/C.2 (`summary`, filters, `409`), และ Group D Immediate Sync (`FULL_SYNC` heartbeat + fallback)
    - `app/src/workflow/collections-api.js`: เพิ่ม `prepareUserMutation` & `finalizeMutationSideEffects` ตรวจ `username` ไม่ซ้ำ, บังคับ Password Complexity 8–16 ตัวอักษร, ล็อกสถานะ `is_status_locked` (`409` + `SPOKE_OVERRIDE_REJECTED`), ตัด Session ทันทีเมื่อระงับ/ลบผู้ใช้ (`revokeUserSessions`), และบันทึก Audit Log (`USER-CREATE`, `SSO-04`, `PW-RESET`, `USER-ACTIVATE`, `USER-UPDATE`, `ROLE-UPDATE`)
    - `app/public/js/ciam-admin-panel.js` & `app/public/js/apex-cloud-bridge.js`: ปรับ Login Gate แบบ State-Driven & Responsive ตาม CIAM Spec §5.2, ปุ่ม 👁️ แสดง/ซ่อนรหัสผ่าน, ปุ่ม `🔑 เปลี่ยนรหัสผ่าน` บน Topbar สำหรับบัญชี Local, ตัวเลือก `ciam_auto_provision_group` & `ciam_session_ttl_minutes` ในหน้า Settings, 401 Expiry Interceptor (`window.__APEX_ON_401__`), และป้องกันค้างรหัสผ่านใน Optimistic Client Store
    - `app/public/index.html`: ปรับหน้า `#v-users` ให้จัดการ `username`, `department`, `use_ad_auth` (AD SSO vs Local), ตั้งรหัสผ่าน Local, `must_change_password`, แสดงสถานะ `is_status_locked`, ถอด checkbox `mine` เดิมออก, อัปเดต `demoData` (`U01`–`U10`), และแสดง error จาก server ใน `toast` (ไม่แตะต้อง `PKEYS`, `ROLE_DEF`, `EXT_DENY` หรือ Business Process Flow)
    - `scripts/verify-local.js`: เพิ่ม **Section 11** ทดสอบ Username Login, Persistent DB Session, Password Complexity, Immediate Session Revocation, `409 status_locked`, และ Group C Spec C.1/C.2
  - Commit ก่อนหน้าบน `Sec1`: **`8477d45`** (`fix(sso)`), **`393efef`** (`fix(security)`)
  - Branch กลางของทีม (`main` / `origin/main`): **`4a92ab1`** (`Merge pull request #3 from ITWA-PCL/Sec1`)
  - Branch ของ CFO (Track B): `feat/flow-cfo` (แตกจาก `main` และเริ่มพัฒนาแล้ว)
- **สถานะการทดสอบ (Local Compile & Verification บน Branch `Sec1`):**
  - `node scripts/verify-local.js`: **ผ่านครบถ้วน 100% (`0 Errors`)** (13 Syntax checks + Sections 1–11 Security/Auth/Session/Finance/CIAM checks)
  - Inline Script Check (`app/public/index.html` ผ่าน `vm.Script`): **ผ่าน Cleanly**

---

### 1. สรุปสิ่งที่ทำเสร็จสมบูรณ์แล้วใน Session นี้ (Completed Security v2.12.0 & PR #3)

1. **อัปเกรดและผสานระบบความปลอดภัยตาม Central IAM Spoke Spec v2.12.0 (PR #2 & PR #3 → `main`):**
   - โค้ดจาก PR #1 (`3099d6f`), PR #2 (`d68f371` — CIAM Spec v2.12.0 `fad31f3`), และ PR #3 (`4a92ab1` — CIAM Health Check Probe `27ad65d` + Docker Postgres Digest Pin `70d16e5`) ได้รับการ Merge เข้าสู่ `main` ครบถ้วนแล้ว
   - **Enterprise In-App Bot Defense 3 ชั้น (หมวด F):**
     - **Layer 1 (IP Rate Limiting):** `createAuthRateLimiter` ควบคุมความถี่เฉพาะ Auth Endpoints ไม่เกิน 10 requests / 60 วินาที ต่อ IP ยกเว้น Corporate Whitelist (`157.173.219.153`, `49.231.185.245`, `172.18.0.1`, `127.0.0.1`) พร้อม Header `Retry-After` และ Log `IP_RATE_LIMITED`
     - **Layer 2 (Decoy Honeypot Trap):** ฟิลด์ซ่อน `corporate_fax` และ `security_honey` หากบอทกรอกเข้ามาจะตอบ Silent Rejection (`401 Unauthorized`) และ Log `BOT_HONEYPOT_DETECTED`
     - **Layer 3 (Timing Velocity Guard):** ตรวจสอบ `form_render_ts` หากส่งข้อมูลเร็วกว่า 400ms ($< 0.4$ วินาที) ปฏิเสธด้วย `400 Bad Request` (`BOT_TIMING_VIOLATION`)
   - **Enterprise Local Password Policy & 90-Day Forced Password Rotation (หมวด G):**
     - **กฎเหล็กยกเว้น Active Directory (Strict AD Exclusion):** บังคับใช้เฉพาะบัญชีท้องถิ่น (`use_ad_auth: false` หรือ Local Admin) เท่านั้น **ข้าม AD Accounts (`use_ad_auth: true`) โดยเด็ดขาด 100%**
     - **Complexity 8–16 ตัวอักษร:** มีตัวพิมพ์ใหญ่ $\ge 1$, ตัวพิมพ์เล็ก $\ge 1$, ตัวเลข $\ge 1$, อักขระพิเศษ $\ge 1$, และห้ามมี Username ในรหัสผ่าน
     - **ระบบตรวจจับ 90 วัน & API เปลี่ยนรหัสผ่าน:** ตรวจสอบ `(now - password_changed_at) >= 90 วัน` และเพิ่ม API `POST /api/auth/local/change-password` บันทึกแฮชด้วย PBKDF2-SHA256 พร้อม Log `PW_CHANGE`
     - **Frontend Forced Password Change Modal:** หน้าต่าง Modal บังคับเปลี่ยนรหัสผ่านพร้อม Real-time Checklist 6 ข้อ เมื่อครบกำหนด 90 วัน
   - **CIAM Authority Lock (`is_status_locked`) & 1-Click Status API (หมวด C.3 & D.7):**
     - `PATCH /api/v1/directory/accounts/:username/status` ปฏิเสธการแก้สถานะด้วย `409 Conflict` (`status_locked`) หาก `is_status_locked == true` เว้นแต่จะมี `force_override: true` และล้าง Active Sessions ทันทีเมื่อระงับสิทธิ์ (`is_active: false`)
   - **Seamless Logout (ข้อ 5.3):**
     - ผู้ใช้ SSO เมื่อออกจากระบบจะ Redirect กลับสู่ **Central IAM Portal (`https://ciam.windowasia.com/portal`)** ส่วนผู้ใช้ Local จะกลับสู่ `/login` ของ APEX

2. **รองรับ CIAM Health Check & Pin PostgreSQL Image (`27ad65d`, `70d16e5`):**
   - เพิ่ม Public Endpoint `GET /api/auth/sso/config` ใน `app/src/security/ciam.js` และเพิ่มใน `PUBLIC_API_PATHS` ของ `app/src/security/rbac.js`
   - รองรับ Docker Bridge IP `172.18.0.1` ร่วมกับ `157.173.219.153` ใน `verifyCiamManagementAuth` และ `DEFAULT_SYSTEM_SETTINGS.ciam_allowed_ips` ของ `app/src/db/postgres.js`
   - Pin `services.postgres.image` ใน `docker-compose.yml` เป็น `postgres:16.16@sha256:30551eca978d79ccf49d037bc297b5670baea61a04ceca42ff7fd3100163d3ce`

3. **การตรวจสอบ Local & GitHub Actions CI:**
   - `node scripts/verify-local.js` ผ่านครบทุกหมวด (`0 Errors`) บน Commit `70d16e5` และ `8477d45`
   - PR #3 (`https://github.com/ITWA-PCL/apex/pull/3`) ผ่าน GitHub Actions CI (`1. Leaked Secret Scan`, `2. Dependency Vulnerability Scan`, `3. Verify Container Build`) ทั้ง 3 Jobs และ Merge เข้า `main` ที่ `4a92ab1` แล้ว

4. **แก้ไขปัญหา CIAM Origin IP & Production SSO Flow (`393efef`, `8477d45` บน `Sec1`):**
   - **CIAM Origin IP Enforcement (`393efef`):** เพิ่ม `getCiamOriginIp(req)`, อนุญาต `157.173.219.153` และ `172.18.0.1` ใน M2M Whitelist, และบันทึก Origin IP `157.173.219.153` ใน Log ธุรกรรม SSO / M2M (พร้อมเก็บ IP เบราว์เซอร์ไว้ใน `details.client_ip`)
   - **SSO Identity (`Chaiwat.N`), Portal Direct Launch & Logout Redirect (`8477d45`):**
     - เพิ่ม `clearApexSessionCookie` ล้างคุกกี้/เซสชันเก่าของ `U01` (`u01@windowasia.co.th`) ทั้งใน `/auth/start`, `/api/auth/sso/login`, และ `handleSsoCallback`
     - แก้ OIDC Endpoints เป็น `/oauth/authorize`, `/api/v1/oauth/token`, `/api/v1/oauth/userinfo`, รองรับทั้ง `/api/auth/sso/callback`, `/auth/callback`, และ `forwardOAuthParamsToCallback` บน `GET /?code=...&state=...`
     - รองรับ Direct Launch จาก CIAM Portal (`state=ciam_launch_*`) และ JIT Auto-Provisioning (`DIR-PROVISION`) ให้ผู้ใช้ CIAM/AD เช่น `Chaiwat.N` (ห้าม Fallback กลับไป `U01`, เคารพ `active === false` -> `403`)
     - แก้ `#btnTopLogout` ใน `app/public/js/ciam-admin-panel.js` และ `handleSsoLogout` บน `POST/GET /api/auth/sso/logout` ให้ Redirect กลับ `https://ciam.windowasia.com/portal`, และ Bump Service Worker เป็น `apex-pwa-v2` (ไม่แคช `?code=`)

---

### 2. ก้าวต่อไปเมื่อกลับมาพัฒนาต่อ (Next Steps When Resuming)

#### ส่วนของคุณ (Track A — Lead Security & Core Architect):
1. **เปิด Pull Request (`Sec1` -> `main`) & Deploy ขึ้น Hostinger VPS (`/var/www/Apex`):**
   - เปิดและ Merge PR ที่ `https://github.com/ITWA-PCL/apex/pull/new/Sec1` (เพื่อนำ `393efef` และ `8477d45` เข้า `main` และรองรับ Auto-Deploy Workflow)
   - รันคำสั่ง Deploy บน VPS `/var/www/Apex`:
     - หลัง Merge เข้า `main`: `cd /var/www/Apex` -> `git pull` -> `docker compose -p apex build apex-app` -> `docker compose -p apex up -d apex-app`
     - หรือหากต้องการทดสอบจาก `Sec1` ทันที: `git pull origin Sec1` แทน `git pull`
   - ฝั่ง **Central IAM (`/var/www/Ciam`)**: อย่าลืม Deploy **`web`** (`a10638c`) และ **`api`** (`051a7ac`) ด้วย
2. **ทดสอบ End-to-End บน Production (`T2.8` & Live SSO Verification):**
   - หลัง Deploy ให้กด Hard Refresh (`Ctrl + Shift + R`) หรือ Unregister Service Worker เก่า (`apex-pwa-v1` -> ใหม่เป็น `apex-pwa-v2`) ในเบราว์เซอร์
   - เข้า `https://ciam.windowasia.com/portal` และคลิกเปิด **APEX (`https://apex.windowasia.com`)**: ยืนยันว่าเป็นชื่อ **`Chaiwat.N`** (ไม่ใช่ `U01` / `u01@windowasia.co.th`)
   - กด Logout จาก APEX แล้วต้อง Redirect กลับสู่ **`https://ciam.windowasia.com/portal`** ทันที
   - ตรวจสอบ M2M Directory Push / Audit Trail (`transaction_logs`) ว่าบันทึก Origin IP `157.173.219.153` ถูกต้อง

#### ส่วนของ CFO (Track B — Business Process Lead):
1. ทำงานต่อเนื่องบน Branch `feat/flow-cfo` ในส่วนของ Flow หน้างาน S1–S8, สูตรการเงิน POC / Cashflow และแบบฟอร์มพิมพ์ `F-00` ถึง `F-18` (อย่าลืมซิงค์กับ `origin/main` ล่าสุดก่อนดำเนินการ)

---

### 3. ข้อควรระวัง / สิ่งที่บล็อกอยู่ (Blockers & Warnings)
- **ไม่มี Blocker:** Commit `8477d45` Push ขึ้น `origin/Sec1` และ Commit `a10638c` Push ขึ้น `Central-IAM/main` เรียบร้อยแล้ว
- **สถานะ Working Tree บนเครื่อง Local (`D:\Python\APEX`):** มีไฟล์ `HANDOFF.md` ที่เพิ่งอัปเดตบันทึกไว้บนเครื่อง Local (ยังไม่ได้ Commit/Push ตามคำสั่งให้เขียนเก็บไว้ก่อน) และไฟล์ `Docs/TestQR-2026-10-29.xlsx` ที่ยังไม่ได้ Track ใน Git
