# HANDOFF.md — Session Handoff & Synchronization Log (APEX)

> **คำแนะนำสำหรับ AI Agent และทีมพัฒนา (คุณ & CFO):**
> 1. **ตอนเริ่มงาน:** อ่านบล็อก **"Latest Handoff Status"** ด้านล่างสุดเสมอ เพื่อรู้ว่าใครทำอะไรไปล่าสุด อยู่บน Branch ไหน และต้องทำอะไรต่อ
> 2. **ตอนจบงาน:** อัปเดตสถานะล่าสุดลงในไฟล์นี้ พร้อมอัปเดต `TASK.md` / `TASKS.md` รัน `node scripts/verify-local.js` และ `scripts/cleanup-cache.ps1` แล้วสั่ง `git commit` & `git push` เสมอ

---

## Latest Handoff Status

- **วันที่ / เวลาล่าสุด:** `2026-10-29 14:36 (+07:00)`
- **ผู้ส่งมอบงานล่าสุด:** Lead Security & Core Architect (ร่วมกับ Antigravity AI)
- **ชื่อโปรเจกต์หลัก:** **APEX** (`https://apex.windowasia.com`)
- **โฟลเดอร์หลักของโปรเจกต์บนเครื่อง Local (คุณ & CFO):** **`D:\Python\APEX`**
- **Git Remote ของบริษัท:** `https://github.com/ITWA-PCL/apex.git`
- **Git Branch ปัจจุบัน:** `feat/sec-ciam-core` (Branch ของคุณ) และซิงค์เข้า `develop` / `main`
- **สถานะภาพรวมของโปรเจกต์:** **Phase 1, Track A Core & Local Folder Standardization (`D:\Python\APEX`) Completed — ผ่านการ Compile ทดสอบบน Local 100%!**

### 1. สิ่งที่ทำเสร็จแล้วใน Session นี้ (Completed Work)
1. **ผสานโครงสร้างกับ Department Application Starter Kit ของบริษัท (`ITWA-PCL/apex`):**
   - รองรับ `docker-compose.yml` (`mock-auth-proxy` ที่พอร์ต `8080`, `dept-app` ที่พอร์ต `3000`, และ `dept-db` PostgreSQL 15)
   - รองรับ `.github/workflows/security-gate.yml` (สแกน Gitleaks, Trivy บน `./app`, และทดสอบ `docker build ./app`)
2. **สร้างระบบฐานข้อมูล PostgreSQL (`app/src/db/postgres.js`):**
   - สร้างตาราง `apex_documents` รองรับทั้ง **22 Collections** ของระบบ APEX พร้อมระบบ Auto-Seed ข้อมูลตัวอย่างชุดสมบูรณ์เข้า PostgreSQL อัตโนมัติในการเปิดใช้งานครั้งแรก (และมี Local JSON Fallback กรณีรันผ่าน Node.js โดยตรงบนเครื่อง CFO)
   - สร้างตาราง `system_settings` (บังคับกฎ **Zero `.env` Dependency** สำหรับค่าคอนฟิก CIAM v2.9.0 และ AI Copilot)
   - สร้างตาราง `transaction_logs` (บันทึก Audit Trail ตามมาตรฐาน ISO/IEC 27001:2022 รหัส `SSO-01`–`SSO-04`, `BG-01`–`BG-02`, `CFG-01`, `SYNC-01`, `DATA-DELETE`)
3. **สร้างระบบ Track A: Security, Central IAM v2.9.0 & RBAC (`app/src/security/`):**
   - `headers.js`: Security Headers มาตรฐาน ISO 27001 และ Rate Limiter
   - `rbac.js`: ระบบตรวจสอบสิทธิ์ 10 บทบาท × 37 สิทธิ์ + กฎเหล็ก `EXT_DENY` 17 สิทธิ์สำหรับบุคคลภายนอก + อ่าน Header `X-User-*` จาก `auth-proxy` และรองรับการสลับ Role (`ดูในฐานะ`)
   - `ciam.js`: API ครบทั้ง Group A (`/api/settings/ciam-sso*`), Group B (OAuth2/OIDC + PKCE `S256` + Break-Glass `172.18.0.1:3100` + `SSO-04` Inactive Account Guard), Group C (`/api/v1/directory/accounts*` พร้อม IP Whitelist `157.173.219.153`), และ Group D (`Immediate Sync`)
   - `copilot.js`: Group E In-App Read-Only AI Copilot พร้อม `ZERO_TRAINING_PRIVACY_HEADERS` และ `sanitizeContextForPrivacy()`
4. **สร้างระบบ Track B: Business Process Flow, Financial Engine & Real-Time PWA (`app/src/workflow/` & `app/public/`):**
   - `finance-engine.js`: สูตรคำนวณใบเบิกงวดช่าง 8 ขั้นตอน (Waterfall), การยกเว้น VAT ค่าขนส่ง, และการล็อกวันที่หนังสือรับรองเงินประกัน (`F-17`)
   - `collections-api.js`: REST API + Server-Sent Events (`/api/v1/events`) ซิงค์ข้อมูลทั้ง 22 Collections แบบ Real-time ข้ามเครื่อง Desktop และ Mobile PWA
   - `app/public/index.html`, `manifest.json`, `sw.js`, `js/apex-cloud-bridge.js`, `js/ciam-admin-panel.js`: หน้าเว็บ PWA ครบ 10 เมนู, 7 Setup Steps, S1–S8, 19 แบบฟอร์มพิมพ์ (`F-00`–`F-18`)
5. **อัปเดตคู่มือและคำสั่งอัตโนมัติสำหรับ CFO (`CFO_CLAUDE_CODE_ONBOARDING.md`, `CLAUDE.md`, `scripts/cleanup-cache.ps1`):**
   - กำหนดโฟลเดอร์โปรเจกต์บนเครื่อง CFO เป็น **`D:\Python\APEX`**
   - ให้ Claude Code ติดตั้ง Component ที่จำเป็น (`Git`, `GitHub CLI`, `Node.js LTS`) ผ่าน `winget` อัตโนมัติ (โดยมี IT ช่วยดูแล) และเปิดเว็บผ่าน **Google Chrome**
   - ย้าย npm cache ไปไว้ที่ `D:\Python\.cache\npm` และสั่งล้างขยะ Cache / Temp / Unused Docker Images อัตโนมัติเพื่อไม่ให้ `Drive C:` เต็ม
   - รองรับการใช้อีเมลส่วนตัวของ CFO ในการสมัครและใช้งาน GitHub

### 2. วิธีที่ CFO จะเริ่มงานในวันพรุ่งนี้ (One-Stop Copy-Paste)
1. สมัคร GitHub ด้วยอีเมลส่วนตัว และกด Accept Invitation เข้า `https://github.com/ITWA-PCL/apex/invitations`
2. เปิดโปรแกรม **Claude Code** แล้วก๊อปปี้ชุดคำสั่งในไฟล์ **`CFO_CLAUDE_CODE_ONBOARDING.md` (ส่วนที่ 2)** ไปวางให้ Claude Code ติดตั้ง Component ทั้งหมดและดึงโปรเจกต์ลงที่ **`D:\Python\APEX`** อัตโนมัติ

### 3. ข้อควรระวัง / สิ่งที่บล็อกอยู่ (Blockers & Warnings)
- ไม่มี Blocker — โค้ดทั้งหมดผ่านการตรวจสอบ `node scripts/verify-local.js` 100% (0 Errors)
