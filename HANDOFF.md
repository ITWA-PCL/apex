# HANDOFF.md — Session Handoff & Synchronization Log (APEX)

> **คำแนะนำสำหรับ AI Agent และทีมพัฒนา (คุณ & CFO):**
> 1. **ตอนเริ่มงาน:** อ่านบล็อก **"Latest Handoff Status"** ด้านล่างสุดเสมอ เพื่อรู้ว่าใครทำอะไรไปล่าสุด อยู่บน Branch ไหน และต้องทำอะไรต่อ
> 2. **ตอนจบงาน:** อัปเดตสถานะล่าสุดลงในไฟล์นี้ พร้อมอัปเดต `TASK.md` แล้วสั่ง `git commit` & `git push` เสมอ

---

## Latest Handoff Status

- **วันที่ / เวลาล่าสุด:** `2026-10-28 16:42 (+07:00)`
- **ผู้ส่งมอบงานล่าสุด:** Lead Security & Core Architect (ร่วมกับ Antigravity AI)
- **Git Branch ปัจจุบัน:** `main` (เพิ่งเริ่มต้น Repository)
- **สถานะภาพรวมของโปรเจกต์:** **Phase 0 Completed (Project Governance & Standards Established)**

### 1. สิ่งที่ทำเสร็จแล้วใน Session นี้ (Completed Work)
1. **วิเคราะห์เอกสารต้นฉบับครบทั้ง 4 ไฟล์ใน `Docs/`:**
   - ถอดรหัสโครงสร้างธุรกิจ 10 เมนู, 7 Setup Steps, 8 ขั้นตอนติดตั้ง (`S1`–`S8`), 22 Data Collections, 19 แบบฟอร์ม (`F-00`–`F-18`), และ 37 สิทธิ์การใช้งานจาก `Docs/install-tracker_26.html` และไฟล์สรุป `.md` ทั้ง 2 ฉบับ
   - ถอดรหัสข้อกำหนดความปลอดภัย **Window Asia Central IAM (CIAM) v2.9.0** (`Docs/CIAM_SPOKE_ENTERPRISE_INTEGRATION_SPECIFICATION_v2.9.0.md`) ครบทั้ง Group A–E
2. **ตกลงชื่อโปรเจกต์และโดเมนอย่างเป็นทางการ:**
   - ชื่อโปรเจกต์: **`APEX`**
   - โดเมน Production: **`https://apex.windowasia.com`**
   - CIAM `app_code`: **`apex`**
3. **วางระบบธรรมาภิบาลของโปรเจกต์ (Governance Files) และ Git:**
   - เริ่มต้น Git Repository (`git init -b main`) และสร้าง `.gitignore`
   - สร้าง `AGENTS.md` (Soul ของระบบและกฎการแบ่งเขตงาน Track A vs Track B ไม่ให้ชนกัน)
   - สร้าง `PRD.md` (เอกสารกำหนดความต้องการของระบบฉบับสมบูรณ์)
   - สร้าง `MEMORY.md` (ข้อตกลงการทำงาน สูตรการเงิน 8 ขั้นตอน และกฎเหล็กด้านความปลอดภัย)
   - สร้าง `TASK.md` (ตารางงานแบ่งตามเฟสและผู้รับผิดชอบ)
   - สร้าง `HANDOFF.md` (ไฟล์ส่งมอบงานระหว่างเครื่องของคุณและเครื่อง CFO)
4. **สร้าง Project Skills เฉพาะทาง 3 ด้านใน `.agent/skills/`:**
   - `wa-ciam-iso27001`: กฎเหล็กการเชื่อมต่อ Central IAM v2.9.0 และ ISO/IEC 27001:2022
   - `wa-install-ui-pwa`: กฎการถอดแบบ UX/UI และระบบพิมพ์ฟอร์ม `F-00`–`F-18` จาก `install-tracker_26.html`
   - `wa-construction-finance`: กฎการคำนวณการเงิน ใบเบิกงวดช่าง 8 ขั้นตอน (Waterfall), POC, Cashflow, และ `F-17`
5. **สร้างสคริปต์ล้างขยะและ Cache รายสัปดาห์ (`scripts/`):**
   - `scripts/cleanup-cache.ps1` (สำหรับเครื่องพัฒนา Windows)
   - `scripts/cleanup-cache.sh` (สำหรับเซิร์ฟเวอร์ Linux Cloud)

### 2. สิ่งที่กำลังทำต่อ / ก้าวต่อไป (Next Immediate Actions)
- **งานถัดไป (`Phase 1: Day 1 Shared Skeleton`):**
  1. สร้างโครงสร้างโปรเจกต์ `backend/` (FastAPI + PostgreSQL schema 22 ตาราง + `system_settings` + `transaction_logs`) และ `frontend/` (Next.js PWA App Shell ตามดีไซน์ `install-tracker_26.html`)
  2. สร้าง **Dual-Mode Auth/RBAC Guard** (มีปุ่มสลับ Role จำลองในโหมดพัฒนาเพื่อให้วันพรุ่งนี้ CFO ดึงโค้ดไปทำ Process Flow ได้ทันที ขณะที่คุณพัฒนาระบบเชื่อม Central IAM จริงใน Track A ควบคู่กันไป)
  3. ผูก Remote Git Repository (GitHub / GitLab) และ Push โค้ดชุดแรกขึ้น Cloud เพื่อให้เครื่อง CFO ดึง (`git pull`) ไปเริ่มทำงานได้ในวันพรุ่งนี้

### 3. ข้อควรระวัง / สิ่งที่บล็อกอยู่ (Blockers & Warnings)
- ยังไม่ได้ผูก URL ของ Remote Git (`git remote add origin <URL>`) — เมื่อสร้าง Private Repo บน GitHub หรือ GitLab แล้ว สามารถนำ URL มาผูกได้ทันที
