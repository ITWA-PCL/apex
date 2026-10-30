# HANDOFF.md — Session Handoff & Synchronization Log (APEX)

> **คำแนะนำสำหรับ AI Agent และทีมพัฒนา (คุณ & CFO) เมื่อกลับมาทำงานครั้งต่อไป:**
> 1. **ตอนเริ่มงาน:** เปิดโปรเจกต์ที่โฟลเดอร์ **`D:\Python\APEX`** แล้วอ่านไฟล์ `HANDOFF.md`, `MEMORY.md`, `TASKS.md` (และ `TASK.md`), `PRD.md`, `AGENTS.md` ตามลำดับเสมอ
> 2. **ตอนจบงาน:** รัน `node scripts/verify-local.js` (ต้อง 0 Errors) และ `scripts/cleanup-cache.ps1` อัปเดตสถานะใน `TASKS.md` / `HANDOFF.md` แล้วสั่ง `git commit` & `git push` เข้า Branch ของตัวเองเสมอ

---

## Latest Handoff Status (จุดพักงานล่าสุด — พร้อมกลับมาทำต่อได้ทันที)

- **วันที่ / เวลาบันทึกส่งมอบ:** `2026-10-30 10:52 (+07:00)`
- **ผู้ส่งมอบงานล่าสุด:** Lead Security & Core Architect (คุณ — Track A ร่วมกับ Antigravity AI)
- **ชื่อโปรเจกต์หลัก:** **APEX** (`https://apex.windowasia.com` — ระบบควบคุมงานติดตั้งประตู-หน้าต่าง)
- **โฟลเดอร์หลักของโปรเจกต์บนเครื่อง Local (ทั้งเครื่องคุณและเครื่อง CFO):** **`D:\Python\APEX`**
- **Git Remote ของบริษัท:** `https://github.com/ITWA-PCL/apex.git`
- **Git Branch ล่าสุด:**
  - Branch ของคุณ (Track A): `feat/sec-ciam-core`
  - Branch ของ CFO (Track B): `feat/flow-cfo` (จะถูกสร้างอัตโนมัติเมื่อ CFO รันคำสั่ง Setup ใน Claude Code)
  - Branch กลางของทีม: `develop` (และ `main` ซิงค์ตรงกันที่สถานะเสถียรล่าสุด)
- **สถานะการทดสอบ (Local Compile & Verification):** **ผ่าน 100% (`0 Errors`)** ด้วยคำสั่ง `node scripts/verify-local.js`

---

### 1. สรุปสิ่งที่ทำเสร็จสมบูรณ์แล้ว (Completed Foundation)

1. **ระบบเอกสารธรรมาภิบาลและคู่มือ AI (Governance & Onboarding):**
   - `AGENTS.md`: กฎเหล็กของโปรเจกต์, การแบ่งเขตโฟลเดอร์ Track A vs Track B, และกฎบังคับ Compile บน Local ก่อน Push
   - `PRD.md`: สเปกฉบับสมบูรณ์ (10 เมนูหลัก, 7 Setup Steps, `S1`–`S8`, 22 Collections, 19 แบบฟอร์ม `F-00`–`F-18`, 10 Roles × 37 Permissions)
   - `MEMORY.md`: ข้อตกลงสถาปัตยกรรม, กฎการเงิน 8-Step Claim Waterfall, ค่าขนส่งไม่มี VAT 7%, และมาตรฐาน CIAM v2.9.0
   - `TASKS.md` & `TASK.md`: ตารางงานแยกความรับผิดชอบชัดเจน (`T0.1`–`T0.8`, `T1.1`–`T1.4`, `T2.1`–`T2.7`, `T3.1`–`T3.2` เสร็จครบ 100%)
   - `CFO_CLAUDE_CODE_ONBOARDING.md` & `CLAUDE.md`: คู่มือ One-Stop สำหรับ CFO (Non-Tech) ที่ใช้อีเมลส่วนตัวสมัคร GitHub ได้เลย และมีกล่องคำสั่งก๊อปปี้วางครั้งเดียวให้ Claude Code ติดตั้ง `Git`, `GitHub CLI`, `Node.js LTS` ผ่าน `winget`, ตั้งโฟลเดอร์ `D:\Python\APEX`, ย้าย Cache ออกจาก `Drive C:` และเปิดเว็บผ่าน Google Chrome อัตโนมัติ
   - `.agent/skills/`: สร้าง Project Skills เฉพาะทางครบ 3 ตัว (`wa-ciam-iso27001`, `wa-install-ui-pwa`, `wa-construction-finance`)
   - `scripts/verify-local.js` & `scripts/cleanup-cache.ps1`: สคริปต์ตรวจสอบโค้ด 0 Errors ก่อน Push และสคริปต์ป้องกัน `Drive C:` เต็ม (ย้าย npm cache ไป `D:\Python\.cache\npm` + ลบ Cache/Temp/Unused Docker Images)

2. **ระบบฐานข้อมูลและโครงสร้าง Cloud Starter Kit (`app/src/db/` & Docker):**
   - ผสานเข้ากับ Department Application Starter Kit ของบริษัท (`docker-compose.yml`, `auth-proxy/default.conf`, `.github/workflows/security-gate.yml`)
   - `app/src/db/postgres.js`: รองรับ PostgreSQL (`dept-db`) ตาราง `apex_documents` (22 Collections), `system_settings` (Zero `.env`), และ `transaction_logs` (ISO 27001 Audit Trail) พร้อมระบบ Local JSON Fallback (`app/.data/local-db.json`) เพื่อให้รันด้วย `node app/index.js` บนเครื่อง Local ได้ทันทีแม้ไม่ได้เปิด Docker

3. **ระบบ Track A: Security, Central IAM v2.9.0 & RBAC (`app/src/security/`):**
   - `headers.js`: Security Headers มาตรฐาน ISO/IEC 27001:2022 และ Rate Limiter
   - `rbac.js`: ระบบตรวจสอบสิทธิ์ 10 บทบาท × 37 สิทธิ์ + User Overrides + กฎเหล็ก `EXT_DENY` (บล็อก 17 สิทธิ์ของ `contractor`/`customer` เสมอ) + รองรับการสลับ Role (`ดูในฐานะ`)
   - `ciam.js`: API ครบทั้ง Group A–D (OAuth2/OIDC + PKCE `S256`, Break-Glass `172.18.0.1:3100`, `SSO-04` Inactive Account Guard, Directory Push IP Whitelist `157.173.219.153`, และ Immediate Sync)
   - `copilot.js`: Group E Read-Only AI Copilot พร้อม `ZERO_TRAINING_PRIVACY_HEADERS` และ `sanitizeContextForPrivacy()`

4. **ระบบ Track B: Business Process Flow, Financial Engine & PWA UI (`app/src/workflow/` & `app/public/`):**
   - `finance-engine.js`: เครื่องคำนวณใบเบิกงวดช่าง 8 ขั้นตอน (Waterfall), ใบแจ้งหนี้ลูกค้า (ค่าขนส่งปลอด VAT 7%), และการล็อกวันที่หนังสือรับรองเงินประกัน (`F-17`)
   - `collections-api.js`: REST API + Real-time Server-Sent Events (`/api/v1/events`) ซิงค์ข้อมูลทั้ง 22 Collections
   - `app/public/index.html` & `js/apex-cloud-bridge.js` & `js/ciam-admin-panel.js`: หน้าจอ PWA ต้นฉบับ `install-tracker_26.html` เชื่อมต่อระบบฐานข้อมูลและปุ่มตั้งค่า Central IAM SSO

---

### 2. ก้าวต่อไปเมื่อกลับมาพัฒนาต่อ (Next Steps When Resuming)

#### ส่วนของคุณ (Track A — Lead Security & Core Architect):
1. **เปิดโฟลเดอร์ใหม่ใน Antigravity IDE:** ไปที่เมนู `File -> Open Folder...` แล้วเลือก **`D:\Python\APEX`** (และสามารถลบโฟลเดอร์เก่า `D:\Python\PurposeSystem` ทิ้งได้เลย)
2. **งานถัดไป (`T2.8`):**
   - ทดสอบการเชื่อมต่อกับเซิร์ฟเวอร์ Central IAM จริง (`https://ciam.windowasia.com`) ด้วย `Client ID`, `Client Secret`, และ `Management API Key` ของแอป `apex` ผ่านปุ่ม **`🔐 Central IAM SSO`** บนแถบเมนูด้านซ้ายล่างของหน้าเว็บ
   - ทดสอบ Flow การล็อกอินจริง, การรับ Webhook Directory Push (Group C), และการกดปุ่ม Immediate Sync (Group D)
3. **คำสั่งพูดคุยกับ AI เมื่อกลับมาเปิด Session ใหม่:**
   > *"อ่านไฟล์ HANDOFF.md, MEMORY.md, TASKS.md, PRD.md และ AGENTS.md แล้วสรุปสถานะล่าสุดให้ฟัง เพื่อเริ่มพัฒนาส่วน Track A ต่อ"*

#### ส่วนของ CFO (Track B — Business Process Lead):
1. สมัคร GitHub ด้วยอีเมลส่วนตัว -> แจ้ง Username ให้คุณกด Invite เข้า `https://github.com/ITWA-PCL/apex` -> กด Accept Invitation
2. เปิดโปรแกรม **Claude Code** แล้วก๊อปปี้ชุดคำสั่งในไฟล์ **`CFO_CLAUDE_CODE_ONBOARDING.md` (ส่วนที่ 2)** ไปวาง เพื่อให้ Claude Code ติดตั้ง Component ทั้งหมดและดึงโปรเจกต์ลงที่ **`D:\Python\APEX`** อัตโนมัติ
3. เริ่มตรวจสอบและปรับปรุงรายละเอียดทางธุรกิจตามรายการงาน **`T3.3` ถึง `T3.6`** (ประมูลงาน, 7 Setup Steps, การนำเข้า SO จาก SAP, ขั้นตอนหน้างาน `S1`–`S8` / QR รับของ `S4`, สูตรการเงิน POC / Cashflow และแบบฟอร์มพิมพ์ `F-00`–`F-18`)

---

### 3. ข้อควรระวัง / สิ่งที่บล็อกอยู่ (Blockers & Warnings)
- **ไม่มี Blocker:** ระบบพร้อมทำงานต่อได้ทันทีทั้งฝั่งคุณ (Track A) และฝั่ง CFO (Track B)
