# HANDOFF.md — Session Handoff & Synchronization Log (APEX)

> **คำแนะนำสำหรับ AI Agent และทีมพัฒนา (คุณ & CFO) เมื่อกลับมาทำงานครั้งต่อไป:**
> 1. **ตอนเริ่มงาน:** เปิดโปรเจกต์ที่โฟลเดอร์ **`D:\Python\APEX`** แล้วอ่านไฟล์ `HANDOFF.md`, `MEMORY.md`, `TASKS.md` (และ `TASK.md`), `PRD.md`, `AGENTS.md` ตามลำดับเสมอ
> 2. **ตอนจบงาน:** รัน `node scripts/verify-local.js` (ต้อง 0 Errors) และ `scripts/cleanup-cache.ps1` อัปเดตสถานะใน `TASKS.md` / `HANDOFF.md` แล้วสั่ง `git commit` & `git push` เข้า Branch ของตัวเองเสมอ

---

## Latest Handoff Status (จุดพักงานล่าสุด — พร้อมกลับมาทำต่อได้ทันที)

- **วันที่ / เวลาบันทึกส่งมอบ:** `2026-11-13 22:50 (+07:00)`
- **ผู้ส่งมอบงานล่าสุด:** Lead Security & Core Architect (คุณ — Track A ร่วมกับ Antigravity AI)
- **ชื่อโปรเจกต์หลัก:** **APEX** (`https://apex.windowasia.com` — ระบบควบคุมงานติดตั้งประตู-หน้าต่าง)
- **โฟลเดอร์หลักของโปรเจกต์บนเครื่อง Local (ทั้งเครื่องคุณและเครื่อง CFO):** **`D:\Python\APEX`**
- **โฟลเดอร์ Production บน Hostinger VPS:** **`/var/www/Apex`**
- **Git Remote ของบริษัท:** `https://github.com/ITWA-PCL/apex.git`
- **Git Branch & Commit ล่าสุด:**
  - Branch งาน Security ล่าสุดของคุณ (Track A): **`Sec1`** (แตกจาก `origin/main` ล่าสุดที่ผสาน PR #1 สำเร็จแล้ว และอัปเกรดมาตรฐานความปลอดภัยตาม Central IAM Spoke Spec v2.12.0 เรียบร้อย)
  - Commit ล่าสุดบน `Sec1`: **`fad31f3`** (`feat(security): implement CIAM v2.12.0 90-day local password rotation, complexity, bot defense & authority lock`)
  - Remote Branch: **`origin/Sec1`** (Push สำเร็จเรียบร้อยแล้ว รอน้องโก้ตรวจ Security & CI ก่อนเปิด PR เข้า `main`)
  - Branch ของ CFO (Track B): `feat/flow-cfo` (แตกจาก `main` ล่าสุดและเริ่มพัฒนาแล้ว)
  - Branch กลางของทีม: `main`
- **สถานะการทดสอบ (Local Compile & Verification):** **ผ่าน 100% (`0 Errors`)** ด้วยคำสั่ง `node scripts/verify-local.js` บน Branch `Sec1`

---

### 1. สรุปสิ่งที่ทำเสร็จสมบูรณ์แล้วใน Session นี้ (Completed Security v2.12.0)

1. **สลับมาทำงานบน Branch `Sec1` จาก `origin/main`:**
   - โค้ดชุดเดิมจาก PR #1 (`feat/sec-ciam-core`) ได้รับการ Approve & Merge เข้าสู่ `main` บน GitHub เรียบร้อยแล้ว (Commit `3099d6f`)
   - แตก Branch `Sec1` จาก `origin/main` ล่าสุด ทำให้ได้ฐานโค้ดที่สดใหม่ ปลอดภัย ไร้ Git Conflict

2. **อัปเกรดระบบความปลอดภัยตามข้อกำหนด Central IAM Spoke Spec v2.12.0 ครบถ้วน:**
   - **Enterprise In-App Bot Defense 3 ชั้น (หมวด F):**
     - **Layer 1 (IP Rate Limiting):** `createAuthRateLimiter` ควบคุมความถี่เฉพาะ Auth Endpoints อยู่ที่ไม่เกิน 10 requests / 60 วินาที ต่อ IP ยกเว้น Corporate Whitelist (`157.173.219.153`, `49.231.185.245`, `172.18.0.1`, `127.0.0.1`) พร้อมส่ง Header `Retry-After` และ Log `IP_RATE_LIMITED`
     - **Layer 2 (Decoy Honeypot Trap):** ฟิลด์ซ่อน `corporate_fax` และ `security_honey` หากบอทกรอกเข้ามาจะส่งผลลัพธ์ Silent Rejection (`401 Unauthorized`) และ Log `BOT_HONEYPOT_DETECTED`
     - **Layer 3 (Timing Velocity Guard):** ตรวจสอบ `form_render_ts` หากส่งข้อมูลเร็วกว่า 400ms ($< 0.4$ วินาที) ปฏิเสธด้วย `400 Bad Request` (`BOT_TIMING_VIOLATION`)
   - **Enterprise Local Password Policy & 90-Day Forced Password Rotation (หมวด G):**
     - **กฎเหล็กยกเว้น Active Directory (Strict AD Exclusion):** บังคับใช้เฉพาะบัญชีท้องถิ่น (`use_ad_auth: false` หรือ Local Admin) เท่านั้น **ข้าม AD Accounts (`use_ad_auth: true`) โดยเด็ดขาด 100%**
     - **Complexity 8–16 ตัวอักษร:** มีตัวพิมพ์ใหญ่ $\ge 1$, ตัวพิมพ์เล็ก $\ge 1$, ตัวเลข $\ge 1$, อักขระพิเศษ $\ge 1$, และห้ามมี Username ในรหัสผ่าน
     - **ระบบตรวจจับ 90 วัน & API เปลี่ยนรหัสผ่าน:** ตรวจสอบ `(now - password_changed_at) >= 90 วัน` และเพิ่ม API `POST /api/auth/local/change-password` บันทึกแฮชด้วย PBKDF2-SHA256 พร้อม Log `PW_CHANGE`
     - **Frontend Forced Password Change Modal:** หน้าต่าง Modal บังคับเปลี่ยนรหัสผ่านพร้อม Real-time Checklist 6 ข้อ เมื่อครบกำหนด 90 วัน
   - **CIAM Authority Lock (`is_status_locked`) & 1-Click Status API (หมวด C.3 & D.7):**
     - เพิ่ม `PATCH /api/v1/directory/accounts/:username/status`
     - หากบัญชีมี `is_status_locked == true` จะปฏิเสธการแก้สถานะด้วย `409 Conflict` (`status_locked`) เว้นแต่จะมีคำสั่ง `force_override: true`
     - หากระงับสิทธิ์ (`is_active: false`) ระบบจะล้าง Active Sessions ของผู้ใช้นั้นทิ้งทันที
   - **Seamless Logout (ข้อ 5.3):**
     - ผู้ใช้ SSO เมื่อออกจากระบบจะพา Redirect กลับสู่ **Central IAM Portal (`https://ciam.windowasia.com/portal`)**
     - ผู้ใช้ Local จะกลับสู่หน้า `/login` ของ APEX

3. **ผ่านการทดสอบ Local Suite ครบทุกหมวด (0 Errors):**
   - ผ่านทั้ง Syntax Compile, Track A RBAC, Case-Insensitive Auth Gate, Password Migration, SSO Callback Hardening, AI Copilot Zero-Training, 8-Step Finance Engine, Deploy Hardening, Post-Login Scoping, Spec v2.12.0 Bot Defense & 90-Day Password Rotation, และ CIAM Authority Lock

4. **Commit และ Push ขึ้น Git Remote เรียบร้อยแล้ว:**
   - Commit `fad31f3` อยู่บน `origin/Sec1` เรียบร้อยแล้ว

---

### 2. ก้าวต่อไปเมื่อกลับมาพัฒนาต่อ (Next Steps When Resuming)

#### ส่วนของคุณ (Track A — Lead Security & Core Architect):
1. **แจ้งน้องโก้ (ทีม Infra/Security):**
   - แจ้งน้องโก้ให้ตรวจสอบความถูกต้องด้าน Security และผลรัน CI บน Branch **`Sec1`** (`https://github.com/ITWA-PCL/apex/tree/Sec1`)
   - เมื่อผ่านการตรวจสอบแล้ว สามารถเปิด Pull Request (PR) จาก `Sec1` เข้าสู่ `main` ได้ทันที (ตามลิงก์ `https://github.com/ITWA-PCL/apex/pull/new/Sec1`)
2. **งานถัดไป (`T2.8`):**
   - ทดสอบการเชื่อมต่อกับเซิร์ฟเวอร์ Central IAM จริง (`https://ciam.windowasia.com`) ด้วย `Client ID`, `Client Secret`, และ `Management API Key` ของแอป `apex` ผ่านหน้าต่าง Admin บนหน้าเว็บ
   - ทดสอบ Flow การล็อกอินจริง, Directory Push Webhook (Group C), และ Immediate Sync (Group D)

#### ส่วนของ CFO (Track B — Business Process Lead):
1. ทำงานต่อเนื่องบน Branch `feat/flow-cfo` ในส่วนของ Flow หน้างาน S1–S8, สูตรการเงิน POC / Cashflow และแบบฟอร์มพิมพ์ `F-00` ถึง `F-18`

---

### 3. ข้อควรระวัง / สิ่งที่บล็อกอยู่ (Blockers & Warnings)
- **ไม่มี Blocker:** Branch `Sec1` สะอาด พร้อมสำหรับขั้นตอน Code Review & CI Inspection โดยทีม Security ครับ
