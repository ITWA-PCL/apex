# TASKS.md (TASK.md) — Master Task List & Team Ownership (APEX)

> **Project:** **APEX** (`https://apex.windowasia.com`)
> **Repository:** `https://github.com/ITWA-PCL/apex.git`
> **Updated:** 2026-10-28 20:45 (+07:00)
> **Status Legend:** `[x]` Completed | `[/]` In Progress | `[ ]` Pending

---

## Phase 0: Project Governance, Git & DevSecOps Foundation (Shared) — COMPLETED ✅
- [x] **T0.1** ตั้งชื่อโปรเจกต์อย่างเป็นทางการ (`APEX` / `apex.windowasia.com`) และตกลงสถาปัตยกรรม Production
- [x] **T0.2** เริ่มต้นระบบ Git (`main` และ `develop`) และผสานเข้ากับ **Department Application Starter Kit** ของบริษัท (`.github/workflows/security-gate.yml`, `docker-compose.yml`, `auth-proxy/`)
- [x] **T0.3** สร้างไฟล์หลักของระบบ: `AGENTS.md`, `PRD.md`, `MEMORY.md`, `TASK.md`, `TASKS.md`, `HANDOFF.md`
- [x] **T0.4** สร้าง Project Skills เฉพาะทางใน `.agent/skills/` (`wa-ciam-iso27001`, `wa-install-ui-pwa`, `wa-construction-finance`)
- [x] **T0.5** สร้างสคริปต์ล้าง Cache รายสัปดาห์ (`scripts/cleanup-cache.ps1` และ `scripts/cleanup-cache.sh`)
- [x] **T0.6** เชื่อมต่อ Remote Git Repository ของบริษัท (`https://github.com/ITWA-PCL/apex.git`) สำเร็จ
- [x] **T0.7** สร้างระบบบังคับตรวจสอบและ Compile บนเครื่อง Local ก่อน Push (`scripts/verify-local.js` / `npm --prefix app test`)
- [x] **T0.8** สร้างคู่มือ One-Stop สำหรับ CFO (Non-Tech) และคำสั่งควบคุม Claude Code อัตโนมัติ (`CFO_CLAUDE_CODE_ONBOARDING.md` และ `CLAUDE.md`)

---

## Phase 1: Day 1 Shared Skeleton & Cloud Database Bridge (ทำวันนี้เพื่อส่งต่อให้ CFO พรุ่งนี้) — COMPLETED ✅
> **เป้าหมาย:** สร้างโครงฐานข้อมูล PostgreSQL (`dept-db`) + ระบบเชื่อม `auth-proxy` & RBAC + หน้าเว็บ PWA ตาม `install-tracker_26.html` เพื่อให้วันพรุ่งนี้ CFO ดึงโค้ด (`git pull`) แล้วรัน `docker compose up --build` เปิด `http://localhost:8080` พัฒนา Process Flow ต่อได้ทันที

- [x] **T1.1 [Shared/Lead]** สร้างโครงสร้างโปรเจกต์ใน `app/` (`app/Dockerfile`, `app/package.json`, `app/index.js`) ให้ผ่าน GitHub Actions (`Gitleaks`, `Trivy`, `docker build ./app`) 100%
- [x] **T1.2 [Shared/Lead]** สร้าง Database Layer (`app/src/db/postgres.js`) รองรับทั้ง 22 Collections (`apex_documents`) + ตาราง `system_settings` (Zero `.env`) + ตาราง `transaction_logs` (ISO 27001 Audit Trail) พร้อมระบบ Auto-Seed ข้อมูลตั้งต้น
- [x] **T1.3 [Track A - คุณ]** สร้างระบบ Auth/RBAC Middleware (`app/src/security/rbac.js`) แบบ Dual-Mode: อ่าน Header `X-User-*` จาก `auth-proxy` + รองรับปุ่มสลับ Role (`ดูในฐานะ`) ทดสอบครบ 10 บทบาท × 37 สิทธิ์ + บังคับกฎ `EXT_DENY` 17 สิทธิ์
- [x] **T1.4 [Shared/UI]** สร้าง PWA App Shell (`app/public/index.html`, `manifest.json`, `sw.js`, `js/apex-cloud-bridge.js`) ถอดแบบจาก `Docs/install-tracker_26.html` ครบ 10 เมนูหลัก, 7 Setup Steps, S1–S8, 19 แบบฟอร์มพิมพ์ (`F-00`–`F-18`) และเชื่อม Real-Time Server-Sent Events (SSE) กับ PostgreSQL

---

## Phase 2: Track A — Security, Central IAM v2.9.0 & ISO 27001 (รับผิดชอบโดย: คุณ)
> **โฟลเดอร์ที่รับผิดชอบ:** `app/src/security/`, `app/public/js/ciam-admin-panel.js`, `auth-proxy/`, `.github/workflows/`, `scripts/`

- [x] **T2.1 [Track A]** ระบบจัดการ `system_settings` (Zero `.env` Dependency) และ API Group A (`/api/settings/ciam-sso`, `/api/settings/ciam-sso/test`) ใน `app/src/security/ciam.js`
- [x] **T2.2 [Track A]** ระบบ OAuth2/OIDC + PKCE (`S256`) และ API Group B (`/auth/start`, `/api/auth/sso/login`, `/api/auth/sso/callback`, `/api/auth/sso/logout`, `/api/auth/sso/break-glass`)
- [x] **T2.3 [Track A]** ระบบ Inactive Account Guard (`SSO-04`) และ Non-AD Local Account (`use_ad_auth: false`) สำหรับผู้รับเหมา (`contractor`) และลูกค้า (`customer`)
- [x] **T2.4 [Track A]** ระบบซิงค์บัญชีผู้ใช้กับ Central IAM: Group C (`/api/v1/directory/accounts*` พร้อม IP Whitelist `157.173.219.153`) และ Group D (ปุ่ม Immediate Sync `/api/settings/ciam-sso/sync-now`)
- [x] **T2.5 [Track A]** ระบบจัดการสิทธิ์ RBAC 10 Roles × 37 Permissions + User Overrides (`grant`/`deny`) + กฎเหล็ก `EXT_DENY` (17 สิทธิ์) + หน้าจอ Admin ตั้งค่า CIAM & ดู Audit Logs (`app/public/js/ciam-admin-panel.js`)
- [x] **T2.6 [Track A]** ระบบบันทึก Audit Trail (`transaction_logs`) ครบทุกรหัส (`SSO-01`–`SSO-04`, `BG-01`–`BG-02`, `CFG-01`, `SYNC-01`, `DATA-DELETE`)
- [x] **T2.7 [Track A]** ระบบ In-App AI Copilot (`app/src/security/copilot.js` — Group E Read-Only 100%, `ZERO_TRAINING_PRIVACY_HEADERS`, DLP Scrubber `sanitizeContextForPrivacy`)
- [ ] **T2.8 [Track A]** ทดสอบเชื่อมต่อกับเซิร์ฟเวอร์ Central IAM จริง (`https://ciam.windowasia.com`) ด้วย Client ID & Secret จริงของบริษัท

---

## Phase 3: Track B — Business Process Flow, Finance & Forms (รับผิดชอบโดย: CFO)
> **โฟลเดอร์ที่รับผิดชอบ:** `app/src/workflow/`, `app/public/index.html`

- [x] **T3.1 [Track B]** โครงสร้างพื้นฐานทั้ง 10 เมนูหลัก + API ซิงค์ข้อมูล 22 Collections แบบ Real-time (`app/src/workflow/collections-api.js`)
- [x] **T3.2 [Track B]** เครื่องคำนวณการเงิน (`app/src/workflow/finance-engine.js`): สูตรใบเบิกงวดช่าง 8 ขั้นตอน (Waterfall), การยกเว้น VAT ค่าขนส่ง, และล็อกวันที่ `F-17` ตาม `allAccDate`
- [ ] **T3.3 [Track B - CFO]** ตรวจสอบและปรับปรุงรายละเอียดทางธุรกิจของระบบประมูลงาน (`bidding`) และการโอนใบประมูลที่ชนะเป็นโครงการใหม่
- [ ] **T3.4 [Track B - CFO]** ตรวจสอบและปรับปรุงขั้นตอนการตั้งค่าโครงการ 7 ขั้นตอน (`setupSteps` 1–7), การนำเข้าไฟล์ SO จาก SAP, และแผนงบประมาณ (`budgets`)
- [ ] **T3.5 [Track B - CFO]** ตรวจสอบขั้นตอนหน้างาน `S1`–`S8`, จุดหยุดตรวจ Hold Points (◆), การสแกน QR รับของหน้างาน (`S4`), การส่งตรวจรายจุด (`S5`), และการตรวจ QC (`S6`) / NCR
- [ ] **T3.6 [Track B - CFO]** ตรวจสอบและทดสอบสูตรการเงินในหน้างานจริง: ใบส่งเบิกงวดช่าง (`claims`), ใบแจ้งหนี้ลูกค้า (`cinvoices`), มุมบัญชี **POC**, กระแสเงินสด **Cashflow**, และแบบฟอร์มพิมพ์ `F-00`–`F-18`

---

## Phase 4: Integration, Hardening & Production Deployment (`apex.windowasia.com`)
- [x] **T4.1** ทดสอบการทำงานร่วมกันระหว่าง RBAC/CIAM (Track A) และ Process Flow/Finance (Track B) ครบทั้ง 10 บทบาท + ล็อกสิทธิ์ระดับ Collection/Project Scope และป้องกัน Privilege Escalation หลัง Login
- [x] **T4.2** ตรวจสอบผลการสแกน GitHub Actions (`Security & Governance Gatekeeper`: Gitleaks, Trivy, Docker Build) บน Pull Request #1 ผ่านครบทั้ง 3 ด่าน
- [/] **T4.3** Deploy ขึ้น Cloud Production ที่ `https://apex.windowasia.com` (`/var/www/Apex`) และเปิดใช้งาน Cron ล้าง Cache รายสัปดาห์
