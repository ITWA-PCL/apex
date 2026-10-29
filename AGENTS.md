# AGENTS.md — The Soul & Operating Constitution of APEX

> **Project Name:** **APEX** (ระบบควบคุมงานติดตั้งประตู-หน้าต่าง — Door & Window Installation Control System)
> **Organization:** บริษัท วินโดว์ เอเชีย จำกัด (มหาชน) — Window Asia Public Company Limited
> **Production Domain:** `https://apex.windowasia.com`
> **Standard Local Workspace Path:** `D:\Python\APEX`
> **CIAM Spoke App Code:** `apex`
> **Security Standard:** ISO/IEC 27001:2022 & Window Asia Central IAM (CIAM) v2.9.0

---

## 1. MANDATORY SESSION STARTUP PROTOCOL (กฎเหล็กทุกครั้งที่เริ่มทำงาน)

ทุกครั้งที่ AI Agent หรือนักพัฒนาเริ่มต้น Session ใหม่ **ต้องอ่านไฟล์ทั้ง 4 นี้ตามลำดับก่อนเขียนหรือแก้ไขโค้ดใดๆ เสมอ**:

1. **`HANDOFF.md`** — อ่านว่า Session ล่าสุดทำอะไรเสร็จไปบ้าง ค้างอยู่ตรงไหน อยู่บน Git Branch อะไร และก้าวต่อไปคืออะไร
2. **`MEMORY.md`** — อ่านข้อตกลงการทำงาน เงื่อนไขทางธุรกิจ กฎเหล็กด้านความปลอดภัย และการตัดสินใจทางสถาปัตยกรรมทั้งหมด
3. **`TASK.md`** — ตรวจสอบรายการงาน (Task List) สถานะงานปัจจุบัน และผู้รับผิดชอบ (Track A vs Track B)
4. **`PRD.md`** — อ่านขอบเขตระบบ โครงสร้างข้อมูล 22 Collections, 10 เมนูหลัก, 7 ขั้นตอนตั้งค่าโครงการ, 8 ขั้นตอนติดตั้ง (`S1`–`S8`), 19 แบบฟอร์ม (`F-00`–`F-18`) และ 37 สิทธิ์การใช้งาน (RBAC)

> **กฎตอนจบ Session และการส่งโค้ดขึ้น Git (Mandatory Pre-Push Local Compile & Session Close Protocol):**
> 1. **ห้าม Push โค้ดที่ยังไม่ได้ Compile/Test บน Local เด็ดขาด:** หลังแก้ไขโค้ดทุกครั้ง ต้องรันตรวจสอบ Syntax, Dependency, และการ Build/Start บนเครื่อง Local (`node --check`, `npm test` / ทดสอบรันเซิร์ฟเวอร์ หรือ `docker build ./app`) จนมั่นใจว่า **ไม่มี Error 100%** ก่อนเสมอ
> 2. **อัปเดตเอกสารส่งมอบงาน:** ต้องอัปเดตสถานะใน **`TASKS.md`** (และ **`TASK.md`**) พร้อมเขียนสรุปการส่งมอบงานลงใน **`HANDOFF.md`**
> 3. **Push เข้า Branch ของตัวเอง:**
>    - **Track A (คุณ — Lead Security & Architect):** Push ขึ้น Branch ของคุณ (เช่น `feat/sec-*` หรือ `develop`)
>    - **Track B (CFO — Business Process Lead):** Push ขึ้น Branch ของ CFO (เช่น `feat/flow-*` หรือ `develop`)
>    - ห้าม Push โค้ดที่ยังไม่ผ่านการตรวจรับตรงเข้า `main` โดยไม่ผ่านการตรวจสอบ

---

## 2. TEAM OWNERSHIP & GIT MODULAR BOUNDARIES (การแบ่งเขตงานไม่ให้เกิด Git Conflict)

โปรเจกต์ **APEX** พัฒนาแยกกันคนละเครื่อง (Local ของแต่ละคน) และซิงค์ผ่าน Central Git Repository โดยแบ่งขอบเขตโฟลเดอร์อย่างชัดเจน:

### Track A: Security, Authentication, CIAM v2.9.0, RBAC, Audit & Infrastructure (คุณ — Lead Security & Core Architect)
- **ความรับผิดชอบหลัก:**
  - ระบบยืนยันตัวตน OAuth2/OIDC + PKCE (`S256`) เชื่อมกับ **Window Asia Central IAM (`ciam.windowasia.com`)**
  - Group A–E APIs ตามสเปก `CIAM_SPOKE_ENTERPRISE_INTEGRATION_SPECIFICATION_v2.9.0.md`
  - ระบบ Zero `.env` Dependency (เก็บค่าคอนฟิกทั้งหมดลงตาราง `system_settings` ใน PostgreSQL)
  - ระบบ RBAC 10 บทบาท × 37 สิทธิ์ + User Overrides (`grant`/`deny`) + `EXT_DENY` (บล็อก 17 สิทธิ์สำหรับบุคคลภายนอกเสมอ)
  - ระบบ Audit Trail (`transaction_logs`) ตามมาตรฐาน ISO/IEC 27001:2022 (A.8.15)
  - Docker, Nginx/Traefik, CI/CD, และระบบล้าง Cache อัตโนมัติรายสัปดาห์
- **โฟลเดอร์ที่รับผิดชอบ (Track A — ห้าม Track B แก้ไข):**
  - `app/src/security/` (`headers.js`, `rbac.js`, `ciam.js`, `copilot.js`)
  - `app/src/db/` (`postgres.js`)
  - `app/public/js/ciam-admin-panel.js`, `app/public/js/apex-cloud-bridge.js`
  - `auth-proxy/`, `.github/workflows/`, `docker-compose.yml`, `scripts/`

### Track B: Business Process Flow, Financial Engine, Forms & PWA UI (CFO — Business Process Lead)
- **ความรับผิดชอบหลัก:**
  - กระบวนการทำงานหลัก 10 เมนู, 7 ขั้นตอนตั้งค่าโครงการ (`setupSteps`), 8 ขั้นตอนติดตั้ง (`S1`–`S8`) รายช่องเปิด (Opening)
  - ระบบประมูลราคา (Bidding), งบประมาณ (Budget/Cost Sheet), ประเมินราคาทีมช่าง, ตรวจรับงาน (QC/Hold Points), NCR
  - ระบบการเงิน: ใบเบิกงวดช่าง 8 ขั้นตอน (Waterfall Claim Calculation), ใบแจ้งหนี้ลูกค้า (Customer Invoice), รายงานความสำเร็จตามสัญญา (POC / Percentage of Completion), กระแสเงินสด (Cashflow), หนังสือรับรองคืนเงินประกันผลงาน (`F-17`)
  - ระบบพิมพ์เอกสารมาตรฐาน 19 แบบฟอร์ม (`F-00` ถึง `F-18`)
- **โฟลเดอร์ที่รับผิดชอบ (Track B — พื้นที่ทำงานของ CFO & Claude Code):**
  - `app/src/workflow/` (`finance-engine.js`, `collections-api.js`)
  - `app/public/index.html` (หน้าจอ UI/UX 10 เมนูหลัก, Flow S1–S8, และแบบฟอร์ม `F-00` ถึง `F-18`)

### Git Branching Rules
- `main`: โค้ดสำหรับขึ้น Production (`apex.windowasia.com`) เท่านั้น
- `develop`: โค้ดรวมของทีมที่ใช้ทดสอบร่วมกัน
- `feat/sec-*`: Branch สำหรับงาน Track A (เช่น `feat/sec-ciam-sso`, `feat/sec-rbac-engine`)
- `feat/flow-*`: Branch สำหรับงาน Track B (เช่น `feat/flow-project-setup`, `feat/flow-claims-poc`)

---

## 3. ARCHITECTURAL & SECURITY INVARIANTS (กฎเหล็กห้ามละเมิด)

1. **Zero `.env` Dependency for CIAM & AI Settings:**
   - ห้ามอ่านค่า `CIAM_*` หรือ `AI_COPILOT_*` จากไฟล์ `.env` ในโค้ด Application เด็ดขาด
   - ต้องอ่านและเขียนผ่านตาราง `system_settings` ในฐานข้อมูล PostgreSQL เท่านั้น (`.env` อนุญาตเฉพาะ `DATABASE_URL`, `REDIS_URL`, `APP_MASTER_KEY`, `PORT`)
2. **Inactive Account Guard (`SSO-04`):**
   - เมื่อผู้ใช้ล็อกอินผ่าน Central IAM สำเร็จ หาก `is_active == false` ในฐานข้อมูลของ `APEX` **ห้ามเปิดใช้งานบัญชีอัตโนมัติเด็ดขาด** ต้องปฏิเสธการเข้าใช้งาน (`403 Forbidden`) และบันทึก Audit Log รหัส `SSO-04`
3. **External User Hard-Deny (`EXT_DENY`):**
   - ผู้ใช้ภายนอก (`is_external == true` เช่น ผู้รับเหมาช่วง `contractor` และลูกค้า `customer` ที่ใช้ `use_ad_auth: false`) ต้องถูกตัดสิทธิ์ในกลุ่ม `EXT_DENY` ทั้ง 17 สิทธิ์ออกเสมอ แม้จะมี User Override ก็ตาม
4. **In-App AI Copilot Zero-Mutation & Zero-Training:**
   - AI Copilot ในระบบต้องเป็น **Read-Only 100%** (ห้ามมีเครื่องมือ INSERT/UPDATE/DELETE) ต้องแนบ `ZERO_TRAINING_PRIVACY_HEADERS` และคัดกรองข้อมูลส่วนบุคคลผ่าน `sanitize_context_for_privacy()` ทุกครั้ง
5. **UX/UI Fidelity (`install-tracker_26.html`):**
   - หน้าจอ สี ฟอนต์ (`Sarabun` + `JetBrains Mono`) การจัดวาง โมดอล และแบบฟอร์มพิมพ์ `F-00`–`F-18` ต้องอ้างอิงตามต้นฉบับ `Docs/install-tracker_26.html` อย่างเคร่งครัด รองรับทั้ง Desktop และ Mobile PWA
6. **Weekly Cache Hygiene:**
   - ต้องดูแลให้สคริปต์ `scripts/cleanup-cache.ps1` (Windows) และ `scripts/cleanup-cache.sh` (Linux Cloud) พร้อมทำงานทุกสัปดาห์เพื่อล้าง Docker build cache, dangling images, Next.js `.next/cache`, และ Python cache ไม่ให้เกิดขยะสะสม
