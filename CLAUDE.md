# CLAUDE.md — Operating Instructions for Claude Code (APEX Project)

> **Project:** **APEX** (`https://apex.windowasia.com`) — ระบบควบคุมงานติดตั้งประตู-หน้าต่าง
> **Organization:** บริษัท วินโดว์ เอเชีย จำกัด (มหาชน) (Window Asia Public Company Limited)
> **GitHub Repository:** `https://github.com/ITWA-PCL/apex.git`
> **Mandatory Local Project Path (เครื่อง CFO):** `D:\Python\APEX`
> **Browser มาตรฐาน:** Google Chrome (`start chrome http://localhost:3000`)

---

## 👤 1. USER PROFILE, EMAIL POLICY & AUTO-INSTALLER RULE (สำคัญมากสำหรับ Claude Code)

เมื่อคุณ (Claude Code) ทำงานบนเครื่องของ **CFO (Business Process Lead — Track B)**:
1. **ผู้ใช้เป็น Non-Tech Executive (CFO)** ที่เชี่ยวชาญกระบวนการธุรกิจ การเงิน บัญชี (POC / Cashflow / ใบเบิกงวดช่าง 8 ขั้นตอน) และเป็นผู้ออกแบบต้นฉบับ `Docs/install-tracker_26.html` แต่ **ไม่ได้เป็นโปรแกรมเมอร์**
2. **ห้ามขอให้ผู้ใช้พิมพ์คำสั่ง Terminal, Git, หรือติดตั้งโปรแกรมเองเด็ดขาด!**
   - เครื่องของ CFO มี **Claude Code** และ **Google Chrome** ติดตั้งอยู่แล้ว
   - หากเครื่องยังไม่มี `git`, `gh` (GitHub CLI), หรือ `node` (Node.js LTS) **คุณ (Claude Code) ต้องเป็นคนรันคำสั่ง `winget install` ติดตั้งให้ทั้งหมดอัตโนมัติ** (โดยมีเจ้าหน้าที่ IT ช่วยกดยืนยันหน้าต่าง Administrator ถ้าระบบถาม)
3. **นโยบายอีเมล GitHub ของ CFO (Personal Email Allowed):**
   - CFO สามารถใช้อีเมลส่วนตัวใดก็ได้ (เช่น `@gmail.com`, `@hotmail.com`, `@outlook.com`) ในการสมัครและใช้งาน GitHub เพื่อความสะดวกและเพื่อให้บัญชี GitHub นั้นเป็นสมบัติติดตัวของ CFO ตลอดไป แม้ในอนาคตจะไม่ได้ทำงานร่วมกับ Window Asia (WA) แล้วก็ตาม (เนื่องจากสิทธิ์การเข้าถึงโค้ด `ITWA-PCL/apex` ควบคุมผ่าน Collaborator Permission ของ Repository)
4. **โฟลเดอร์ทำงานหลักบนเครื่อง Local:**
   - ต้องอยู่ที่ **`D:\Python\APEX`** เสมอ (ห้ามสร้างไว้ใน `Drive C:` เพื่อประหยัดพื้นที่ `Drive C:`)
5. **การสื่อสาร:**
   - สื่อสารกับผู้ใช้ด้วย **ภาษาไทยที่เข้าใจง่าย กระชับ เน้นผลลัพธ์ทางธุรกิจและหน้าจอการใช้งาน**

---

## 💾 2. DRIVE C: DISK SPACE PROTECTION & CACHE HYGIENE (กฎเหล็กห้ามทำให้ Drive C: เต็ม)

เพื่อป้องกันไม่ให้ `Drive C:` ของเครื่อง CFO (และเครื่องนักพัฒนาทุกคน) ถูกใช้พื้นที่อย่างฟุ่มเฟือยจาก Cache, Temp หรือ Docker Image ที่ไม่ได้ใช้แล้ว คุณ (Claude Code) ต้องทำตามกฎนี้เสมอ:

1. **ย้ายที่เก็บ Cache ของ npm มาไว้ที่ `Drive D:` เสมอ:**
   ```powershell
   New-Item -ItemType Directory -Path "D:\Python\.cache\npm" -Force
   npm config set cache "D:\Python\.cache\npm" --global
   ```
2. **ล้างขยะ Cache, Temp และ Unused Docker Images อัตโนมัติทุกครั้งที่จบงาน (หรือทุกสัปดาห์):**
   - รันสคริปต์ล้างขยะของโปรเจกต์ทุกครั้งก่อนจบงาน:
     ```powershell
     powershell -NoProfile -ExecutionPolicy Bypass -File "D:\Python\APEX\scripts\cleanup-cache.ps1"
     ```
   - สคริปต์นี้จะทำการ:
     - ลบ `C:\Users\<User>\AppData\Local\npm-cache` และไฟล์ชั่วคราวใน `C:\Users\<User>\AppData\Local\Temp` (`npm-*`, `v8-compile-cache*`, `node-compile-cache*`)
     - ลบ Docker Build Cache (`docker builder prune --all --force`) และ **ลบ Docker Image ที่ไม่ได้ใช้แล้วทั้งหมด** (`docker image prune --all --force` และ `docker container prune --force`) หากเครื่องมีการเปิด Docker
     - รายงานพื้นที่ว่างของ `Drive C:` ก่อนและหลังล้างขยะให้ผู้ใช้ทราบ

---

## 🔄 3. MANDATORY SESSION STARTUP PROTOCOL (ทำอัตโนมัติทุกครั้งที่เปิดโปรแกรม)

ทุกครั้งที่เริ่มต้นบทสนทนาใหม่ หรือเมื่อผู้ใช้พิมพ์ว่า **"เริ่มงานวันนี้"** คุณต้องทำ 4 ขั้นตอนนี้อัตโนมัติทันที:

1. **เข้าไปที่ `D:\Python\APEX` และดึงโค้ดล่าสุดจากเซิร์ฟเวอร์กลางของบริษัท:**
   ```powershell
   cd D:\Python\APEX
   git fetch origin
   git checkout feat/flow-cfo 2>$null; if ($LASTEXITCODE -ne 0) { git checkout -b feat/flow-cfo origin/develop }
   git pull origin develop --no-edit
   ```
2. **อ่านไฟล์สมองของระบบทั้ง 5 ไฟล์ตามลำดับ:**
   - `HANDOFF.md` (ดูว่าล่าสุดทีม Security/IT หรือเรามีการส่งมอบงานอะไรไว้)
   - `MEMORY.md` (ดูกฎเหล็กทางธุรกิจและการคำนวณการเงิน)
   - `TASKS.md` (ดูรายการงานที่ค้างอยู่ในส่วนของ Track B)
   - `PRD.md` (ดูขอบเขตระบบ 10 เมนู, 7 Setup Steps, S1–S8, 19 แบบฟอร์ม F-00..F-18)
   - `AGENTS.md` (ดูกฎการแบ่งเขตโฟลเดอร์)
3. **ตรวจสอบว่าระบบรันอยู่หรือยัง และเปิดขึ้นบน Google Chrome:**
   - รันเซิร์ฟเวอร์ (`cd D:\Python\APEX\app && npm start`) แล้วเปิด Google Chrome ไปที่ `http://localhost:3000`:
     ```powershell
     Start-Process "chrome.exe" "http://localhost:3000"
     ```
4. **สรุปสั้นๆ ให้ผู้ใช้ฟังเป็นภาษาไทย:**
   - บอกว่าดึงข้อมูลล่าสุดเรียบร้อยแล้ว ล่าสุดทำอะไรเสร็จไป และวันนี้มีหัวข้อไหนใน `TASKS.md` ที่พร้อมทำต่อ

---

## 🚧 4. STRICT FOLDER BOUNDARIES (เขตพื้นที่ที่อนุญาตให้แก้ไขได้ vs ห้ามแตะต้อง)

เพื่อป้องกันโค้ดชนกัน (Git Conflict) กับทีม IT/Security (Track A):

### ✅ โฟลเดอร์ที่อนุญาตให้คุณแก้ไขได้เต็มที่ (Track B — CFO Area):
- **`app/public/index.html`** — หน้าจอการทำงานทั้งหมด 10 เมนูหลัก, ขั้นตอนตั้งค่าโครงการ 7 ขั้นตอน, งานติดตั้ง `S1`–`S8`, มุมบัญชี POC, กระแสเงินสด Cashflow, และแบบฟอร์มพิมพ์ `F-00` ถึง `F-18`
- **`app/src/workflow/finance-engine.js`** — สูตรคำนวณการเงิน 8-Step Waterfall, ใบแจ้งหนี้ลูกค้า (ค่าขนส่งห้ามคิด VAT 7%), POC, Cashflow
- **`app/src/workflow/collections-api.js`** — API จัดการข้อมูล 22 Collections ทางธุรกิจ
- **`HANDOFF.md`**, **`TASKS.md`**, **`TASK.md`**, **`MEMORY.md`**, **`PRD.md`** — เอกสารส่งมอบงานและรายการงาน

### ⛔ โฟลเดอร์ที่ห้ามแก้ไขเด็ดขาด (Track A — IT & Security Area):
- **`app/src/security/`** (`ciam.js`, `rbac.js`, `headers.js`, `copilot.js`)
- **`app/src/db/postgres.js`**
- **`app/public/js/ciam-admin-panel.js`**, **`app/public/js/apex-cloud-bridge.js`**
- **`auth-proxy/`**, **`.github/workflows/`**, **`docker-compose.yml`**, **`scripts/`**

---

## 🧪 5. MANDATORY PRE-PUSH LOCAL COMPILE, CACHE CLEANUP & CLOSE PROTOCOL (กฎเหล็กก่อนส่งงานขึ้น Git)

ทุกครั้งที่แก้ไขโค้ดเสร็จ หรือเมื่อผู้ใช้พิมพ์ว่า **"จบงานวันนี้"** / **"ส่งโค้ดขึ้นระบบ"**:

1. **ต้อง Compile และรันชุดทดสอบอัตโนมัติบนเครื่อง Local ว่าไม่มี Error 100% ก่อนเสมอ:**
   ```powershell
   cd D:\Python\APEX
   node scripts/verify-local.js
   ```
   - **หากพบ Error แม้แต่จุดเดียว ห้าม `git push` เด็ดขาด!** ต้องซ่อมจนกว่า `node scripts/verify-local.js` จะขึ้น `100% PASSED` ก่อน
2. **ล้างขยะ Cache และ Unused Images เพื่อคืนพื้นที่ให้ Drive C: เสมอ:**
   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File "D:\Python\APEX\scripts\cleanup-cache.ps1"
   ```
3. **อัปเดตเอกสารส่งมอบงานเสมอ:**
   - อัปเดตสถานะงานใน **`TASKS.md`** และ **`TASK.md`** ให้ตรงกัน
   - เขียนสรุปสิ่งที่ทำเสร็จในวันนี้ลงใน **`HANDOFF.md`** (ระบุวันที่ เวลา ผู้ส่งมอบ: CFO / Track B และก้าวต่อไป)
4. **Commit, Push ขึ้นกิ่งของ CFO (`feat/flow-cfo`), และเปิดใบขออนุมัติ (Pull Request) อัตโนมัติ:**
   ```powershell
   git add app/src/workflow/ app/public/index.html HANDOFF.md TASKS.md TASK.md MEMORY.md PRD.md
   git commit -m "feat(flow): <สรุปสิ่งที่แก้ไขสั้นๆ>"
   git push -u origin feat/flow-cfo
   node scripts/open-pr.js
   ```
   *(คำสั่ง `node scripts/open-pr.js` จะสร้างใบ Pull Request ส่งไปให้ Admin กด Approve บนหน้าเว็บ GitHub อัตโนมัติทันที ห้าม Push ตรงเข้ากิ่ง `main` เด็ดขาด)*
