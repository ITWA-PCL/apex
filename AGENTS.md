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
> 3. **Push เข้า Branch ของตัวเอง และสร้าง Pull Request อัตโนมัติ (`node scripts/open-pr.js`):**
>    - **Track A (คุณ — Lead Security & Architect):** Push ขึ้น Branch ของคุณ (เช่น `feat/sec-ciam-core`) แล้วรัน `node scripts/open-pr.js`
>    - **Track B (CFO — Business Process Lead):** Push ขึ้น Branch ของ CFO (`feat/flow-cfo`) แล้วรัน `node scripts/open-pr.js`
>    - สคริปต์ `node scripts/open-pr.js` จะสร้างใบขออนุมัติ (Pull Request) ขึ้นไปรอในแท็บ `Pull requests` บน GitHub ให้ Admin กด Approve & Merge เข้า `main` โดยอัตโนมัติ (ห้าม Push ตรงเข้า `main`)

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

---

## 4. CFO / Track B — Local Work and Push-only Delivery

> กติกาหัวข้อนี้ใช้แทนคำสั่ง "เริ่มงาน / ส่งงาน" เดิมของ CFO เท่านั้น ไม่เปลี่ยนกติกาของ Track A และ Security Invariants ด้านบน
> ที่มา: `APEX-CFO-CLAUDE-SETUP.md` (ระยะที่ 1 ตั้งค่า 2026-11-04)

1. CFO ทำงานเฉพาะกิ่ง `feat/flow-cfo` ใน `ITWA-PCL/apex` ตรวจ repository root, remote และ branch จริงก่อนแก้หรือส่งงานทุกครั้ง (ไม่ยึด path ตายตัว ให้ตรวจโฟลเดอร์ที่เปิดอยู่จริง)
2. เริ่ม session: อ่านคำสั่งและเอกสารส่งมอบ ตรวจ working tree ก่อน fetch / switch / synchronize ไม่แตะงานเดิมที่ไม่ใช่งานของ session นี้ ไม่ stash / reset / clean อัตโนมัติ หากมีงานค้างที่ไม่ชัดเจนให้หยุดให้ IT ช่วย ไม่ pull `develop` อัตโนมัติ การนำ `main` มารวมในกิ่งที่มีงานแล้วให้ทีมเทคนิควางแผน
3. CFO บอกความต้องการและทดสอบผลทางธุรกิจ Claude จัดการขั้นตอนเทคนิค ไม่ต้องให้ CFO พิมพ์ Git
4. งาน Track B ครอบคลุม `app/src/workflow/` และส่วนธุรกิจใน `app/public/index.html` เอกสารที่เกี่ยวข้องแก้ได้ตามงาน ห้ามแก้ Track A ได้แก่ security/auth/RBAC, database infrastructure, deployment, workflows และ scripts โดยไม่มีการประสานและอนุญาตเพิ่มเติม
5. `app/public/index.html` เป็นไฟล์ร่วม ต้องรักษาส่วนเชื่อม authentication/security (เช่น `js/apex-cloud-bridge.js`, `js/ciam-admin-panel.js`, Login Gate) ไม่ลบการตรวจสิทธิ์เพื่อให้ Flow ทำงาน หากต้องเปลี่ยน API หรือสิทธิ์ให้แจ้งทีมเทคนิค
6. ส่งงานเป็นส่วนย่อยที่ตรวจสอบได้ ไม่ต้องรอให้ Flow ทั้งระบบเสร็จ แต่ห้ามอ้างว่าพร้อม production จากผล local tests เพียงอย่างเดียว
7. ไม่ commit หรือ push เพียงเพราะ session จบ ทำได้เมื่อ CFO สั่ง **"ส่งงาน"** หรืออนุญาตส่งงานส่วนที่ระบุอย่างชัดเจนเท่านั้น
8. ก่อนส่ง: ตรวจ diff เลือกไฟล์ที่ตั้งใจทีละไฟล์ อัปเดต `HANDOFF.md` / `TASK.md` / `TASKS.md` รัน `node scripts/verify-local.js` และการทดสอบที่ตรงกับส่วนที่แก้ หาก fail หรือรันไม่ได้ให้หยุดและรายงาน ไม่ลดมาตรฐานหรือแก้ security / scripts เองเพื่อให้ผ่าน
9. Push เฉพาะ commit ที่ทดสอบแล้วจาก `feat/flow-cfo` ไป `origin` ด้วย refspec ชัดเจน: dry-run ก่อนด้วย `git -c push.followTags=false push --dry-run origin HEAD:refs/heads/feat/flow-cfo` แล้วจึง `git -c push.followTags=false push origin HEAD:refs/heads/feat/flow-cfo` และยืนยัน SHA จริงด้วย `git ls-remote --heads origin refs/heads/feat/flow-cfo` ห้าม force / `--all` / `--tags` / `--mirror` และห้ามใช้ `--no-verify`
10. ไม่รัน `scripts/open-pr.js` ไม่เปิดหรือแก้ PR ไม่ merge ไม่ deploy ไม่เปลี่ยนสิทธิ์หรือการตั้งค่าความปลอดภัย ทีมเทคนิคเป็นผู้ดำเนินการต่อ (ไม่มีระบบแจ้งทีมเทคนิคอัตโนมัติ)
11. รายงานเป็นภาษาไทย: scope, branch, commit SHA, ผลทดสอบ, push สำเร็จหรือไม่, สิ่งที่ค้าง และข้อมูลส่งต่อทีมเทคนิค ห้ามอ้างว่า merge / deploy แล้ว

**เครื่องของ CFO:** ไม่ติดตั้งโปรแกรม ไม่เปลี่ยนค่าระบบ (เช่น `npm config set --global`, Git config, credential) และไม่รันสคริปต์ที่ลบ Docker images / cache ทั้งเครื่องโดยอัตโนมัติ — ทำได้เมื่อ CFO หรือ IT อนุญาตเป็นครั้ง ๆ ไป
