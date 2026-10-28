# TASK.md — Master Task List & Team Ownership (APEX)

> **Project:** **APEX** (`https://apex.windowasia.com`)
> **Updated:** 2026-10-28
> **Status Legend:** `[x]` Completed | `[/]` In Progress | `[ ]` Pending

---

## Phase 0: Project Governance, Git & DevSecOps Foundation (Shared)
- [x] **T0.1** ตั้งชื่อโปรเจกต์อย่างเป็นทางการ (`APEX` / `apex.windowasia.com`) และตกลงสถาปัตยกรรม Production
- [x] **T0.2** เริ่มต้นระบบ Git (`git init -b main`) และสร้าง `.gitignore` ตามมาตรฐาน ISO/IEC 27001
- [x] **T0.3** สร้างไฟล์หลักของระบบ: `AGENTS.md`, `PRD.md`, `MEMORY.md`, `TASK.md`, `HANDOFF.md`
- [x] **T0.4** สร้าง Project Skills เฉพาะทางใน `.agent/skills/` (`wa-ciam-iso27001`, `wa-install-ui-pwa`, `wa-construction-finance`)
- [x] **T0.5** สร้างสคริปต์ล้าง Cache รายสัปดาห์ (`scripts/cleanup-cache.ps1` และ `scripts/cleanup-cache.sh`)
- [ ] **T0.6** เชื่อมต่อ Remote Git Repository (GitHub / GitLab Private Repo) เพื่อให้เครื่องของคุณและเครื่อง CFO ซิงค์โค้ดกันได้

---

## Phase 1: Day 1 Shared Skeleton (ทำวันนี้ก่อนส่งต่อให้ CFO พรุ่งนี้)
> **เป้าหมาย:** สร้างโครงฐานข้อมูล + ระบบสลับ Role จำลอง (Mock Auth Guard) + โครงหน้าเว็บ PWA ตาม `install-tracker_26.html` เพื่อให้วันพรุ่งนี้ CFO ดึงโค้ด (`git pull`) ไปทำ Process Flow ต่อได้ทันทีโดยไม่ติดขัดเรื่อง Login

- [ ] **T1.1 [Shared/Lead]** สร้างโครงสร้างโปรเจกต์ `backend/` (FastAPI + SQLAlchemy 2.0 + Alembic) และ `frontend/` (Next.js App Router + Tailwind CSS + PWA Manifest)
- [ ] **T1.2 [Shared/Lead]** สร้าง Database Models ทั้ง 22 Collections + ตาราง `system_settings` และ `transaction_logs` พร้อมข้อมูลตั้งต้น (Seed Data จาก `install-tracker_26.html`)
- [ ] **T1.3 [Track A - คุณ]** สร้างระบบ Auth/RBAC Middleware แบบ Dual-Mode (รองรับ Dev Role Switcher สำหรับให้ CFO ทดสอบ 10 บทบาทได้ทันที + พร้อมสลับเป็น Central IAM SSO จริง)
- [ ] **T1.4 [Shared/UI]** สร้าง App Shell (Sidebar 10 เมนู, Topbar, Theme Colors, Fonts `Sarabun`/`JetBrains Mono`) ถอดแบบจาก `install-tracker_26.html`

---

## Phase 2: Track A — Security, Central IAM v2.9.0 & ISO 27001 (รับผิดชอบโดย: คุณ)
- [ ] **T2.1 [Track A]** ระบบจัดการ `system_settings` (Zero `.env` Dependency) และ API Group A (`/api/settings/ciam-sso`, `/api/settings/ciam-sso/test`)
- [ ] **T2.2 [Track A]** ระบบ OAuth2/OIDC + PKCE (`S256`) + JWKS RS256 Verification และ API Group B (`/auth/start`, `/api/auth/sso/login`, `/api/auth/sso/callback`, `/api/auth/sso/logout`, `/api/auth/sso/break-glass`)
- [ ] **T2.3 [Track A]** ระบบ Inactive Account Guard (`SSO-04`) และ Non-AD Local Account (`use_ad_auth: false`) สำหรับช่างรับเหมา (`contractor`) และลูกค้า (`customer`)
- [ ] **T2.4 [Track A]** ระบบซิงค์บัญชีผู้ใช้กับ Central IAM: Group C (`/api/v1/directory/accounts*` พร้อม IP Whitelist `157.173.219.153`) และ Group D (Agent Heartbeat + ปุ่ม Immediate Sync)
- [ ] **T2.5 [Track A]** ระบบจัดการสิทธิ์ RBAC 10 Roles × 37 Permissions + User Overrides (`grant`/`deny`) + กฎเหล็ก `EXT_DENY` (17 สิทธิ์) + แบบฟอร์ม `F-18`
- [ ] **T2.6 [Track A]** ระบบบันทึก Audit Trail (`transaction_logs`) ครบทุกรหัส (`SSO-01`–`SSO-04`, `BG-01`–`BG-02`, `CFG-01`) และหน้าจอตรวจสอบ Log สำหรับ Admin
- [ ] **T2.7 [Track A]** ระบบ In-App AI Copilot (Group E — Read-Only 100%, Zero-Training Headers, DLP Scrubber `sanitize_context_for_privacy`)

---

## Phase 3: Track B — Business Process Flow, Finance & Forms (รับผิดชอบโดย: CFO)
- [ ] **T3.1 [Track B]** เมนูที่ 1: แดชบอร์ดผู้บริหารและปฏิบัติการ (`dashboard`)
- [ ] **T3.2 [Track B]** เมนูที่ 2: ระบบประมูลงาน (`bidding`), ถอดปริมาณบาน, คำนวณราคา (ค่าขนส่งไม่มี VAT 7%), โอนเป็นโครงการ, พิมพ์ `F-00`
- [ ] **T3.3 [Track B]** เมนูที่ 3: ระบบบริหารโครงการ & Wizard ตั้งค่าโครงการ 7 ขั้นตอน (`setupSteps` 1–7) + Cost Sheet (`F-11`)
- [ ] **T3.4 [Track B]** เมนูที่ 4: ตารางควบคุมงานติดตั้ง 8 ขั้นตอน (`S1`–`S8`), Hold Points (◆), ตาราง Matrix รายช่องเปิด (`openings`), รายงานประจำวัน (`dailies`), ลงเวลา (`timesheets`), พิมพ์ `F-01`, `F-02`, `F-03`, `F-07`, `F-16`
- [ ] **T3.5 [Track B]** เมนูที่ 5: ระบบใบแจ้งงานไม่เป็นไปตามข้อกำหนด (`ncrs`, `F-04`), การแก้ไข Defect (`F-05`), และปัญหาหน้างาน (`issues`)
- [ ] **T3.6 [Track B]** เมนูที่ 6: ระบบทีมช่างรับเหมา (`teams`), สัญญาจ้าง (`engagements`, `F-08`–`F-10`), ฐานข้อมูลวัสดุ/ค่าแรง (`materials`, `labor`, `others`, `customers`)
- [ ] **T3.7 [Track B]** ระบบการเงินและเบิกงวด:
  - ใบเบิกงวดช่าง 8 ขั้นตอน (Waterfall Claim Calculation — `claims`, `F-12`)
  - ใบส่งมอบงานลูกค้า (`handovers`, `F-06`) และใบแจ้งหนี้ลูกค้า (`cinvoices`, `F-13`)
  - หนังสือรับรองคืนเงินประกันผลงาน (`F-17` — ล็อกวันที่ตาม `allAccDate(project, team)`)
- [ ] **T3.8 [Track B]** เมนูที่ 7: รายงานการเงิน ความสำเร็จตามสัญญา **POC (`F-14`)** และกระแสเงินสด **Cashflow (`F-15`)**
- [ ] **T3.9 [Track B]** ระบบตรวจสอบการปิดโครงการ (`S8`: 7 Auto-Checks + 6 Closeout Documents)

---

## Phase 4: Integration, Hardening & Production Deployment (`apex.windowasia.com`)
- [ ] **T4.1** ทดสอบการทำงานร่วมกันระหว่าง RBAC/CIAM (Track A) และ Process Flow/Finance (Track B) ครบทั้ง 10 บทบาท
- [ ] **T4.2** ตรวจสอบความปลอดภัยตามมาตรฐาน ISO/IEC 27001:2022 (OWASP API Top 10, Rate Limit, Security Headers, Backup/Restore)
- [ ] **T4.3** Deploy ขึ้น Cloud Production ที่ `https://apex.windowasia.com` และเปิดใช้งาน Cron ล้าง Cache รายสัปดาห์
