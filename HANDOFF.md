# HANDOFF.md — Session Handoff & Synchronization Log (APEX)

> **คำแนะนำสำหรับ AI Agent และทีมพัฒนา (คุณ & CFO):**
> 1. **ตอนเริ่มงาน:** อ่านบล็อก **"Latest Handoff Status"** ด้านล่างสุดเสมอ เพื่อรู้ว่าใครทำอะไรไปล่าสุด อยู่บน Branch ไหน และต้องทำอะไรต่อ
> 2. **ตอนจบงาน:** อัปเดตสถานะล่าสุดลงในไฟล์นี้ พร้อมอัปเดต `TASK.md` / `TASKS.md` แล้วสั่ง `git commit` & `git push` เสมอ

---

## Latest Handoff Status

- **วันที่ / เวลาล่าสุด:** `2026-10-28 20:46 (+07:00)`
- **ผู้ส่งมอบงานล่าสุด:** Lead Security & Core Architect (ร่วมกับ Antigravity AI)
- **Git Remote ของบริษัท:** `https://github.com/ITWA-PCL/apex.git`
- **Git Branch ปัจจุบัน:** `main` และ `develop` (ซิงค์ตรงกัน 100%)
- **สถานะภาพรวมของโปรเจกต์:** **Phase 1 & Track A Core Completed — พร้อมส่งไม้ต่อให้ CFO พัฒนาต่อได้ทันที!**

### 1. สิ่งที่ทำเสร็จแล้วใน Session นี้ (Completed Work)
1. **ผสานโครงสร้างกับ Department Application Starter Kit ของบริษัท (`ITWA-PCL/apex`):**
   - รองรับ `docker-compose.yml` (`mock-auth-proxy` ที่พอร์ต `8080`, `dept-app` ที่พอร์ต `3000`, และ `dept-db` PostgreSQL 15)
   - รองรับ `.github/workflows/security-gate.yml` (สแกน Gitleaks, Trivy บน `./app`, และทดสอบ `docker build ./app`)
2. **สร้างระบบฐานข้อมูล PostgreSQL (`app/src/db/postgres.js`):**
   - สร้างตาราง `apex_documents` รองรับทั้ง **22 Collections** ของระบบ APEX พร้อมระบบ Auto-Seed ข้อมูลตัวอย่างชุดสมบูรณ์เข้า PostgreSQL อัตโนมัติในการเปิดใช้งานครั้งแรก
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
   - `app/public/index.html`, `manifest.json`, `sw.js`, `js/apex-cloud-bridge.js`, `js/ciam-admin-panel.js`: หน้าเว็บ PWA ครบ 10 เมนู, 7 Setup Steps, S1–S8, 19 แบบฟอร์มพิมพ์ (`F-00`–`F-18`) เชื่อมต่อฐานข้อมูล PostgreSQL จริง

### 2. วิธีที่ CFO (หรือทีมพัฒนาอีกเครื่อง) จะรับงานต่อในวันพรุ่งนี้
1. บนเครื่องของ CFO สั่ง Clone โปรเจกต์จาก Git บริษัท:
   ```bash
   git clone https://github.com/ITWA-PCL/apex.git
   cd apex
   ```
2. รันระบบด้วย Docker Desktop:
   ```bash
   docker compose up --build
   ```
3. เปิดเบราว์เซอร์ไปที่ **`http://localhost:8080`**
   - ระบบจะเชื่อมต่อ PostgreSQL (`dept-db`) อัตโนมัติ และสามารถสลับ Role ทดสอบทั้ง 10 บทบาทที่มุมซ้ายล่าง (`ดูในฐานะ`) ได้ทันที
4. เมื่อ CFO สั่ง AI บนเครื่องตัวเอง ให้บอก AI ว่า:
   > *"อ่านไฟล์ AGENTS.md, HANDOFF.md, MEMORY.md, TASKS.md และ PRD.md ก่อนเริ่มงาน โดยแก้ไขเฉพาะส่วน Process Flow ใน `app/src/workflow/` และ `app/public/index.html`"*

### 3. ข้อควรระวัง / สิ่งที่บล็อกอยู่ (Blockers & Warnings)
- ไม่มี Blocker — โค้ดทั้งหมดผ่านการตรวจสอบ Syntax (`node --check`) ครบทุกไฟล์แล้ว
