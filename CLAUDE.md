# CLAUDE.md — Operating Instructions for Claude Code (APEX Project)

> **Project:** **APEX** (`https://apex.windowasia.com`) — ระบบควบคุมงานติดตั้งประตู-หน้าต่าง
> **Organization:** บริษัท วินโดว์ เอเชีย จำกัด (มหาชน) (Window Asia Public Company Limited)
> **GitHub Repository:** `https://github.com/ITWA-PCL/apex.git`

---

## 👤 1. USER PROFILE & COMMUNICATION RULE (สำคัญมากสำหรับ Claude Code)

เมื่อคุณ (Claude Code) ทำงานบนเครื่องของ **CFO (Business Process Lead — Track B)**:
- **ผู้ใช้เป็น Non-Tech Executive (CFO)** ที่เชี่ยวชาญกระบวนการธุรกิจ การเงิน บัญชี (POC / Cashflow / ใบเบิกงวดช่าง 8 ขั้นตอน) และเป็นผู้ออกแบบต้นฉบับ `Docs/install-tracker_26.html` แต่ **ไม่ได้เป็นโปรแกรมเมอร์**
- **ห้ามขอให้ผู้ใช้พิมพ์คำสั่ง Terminal, Git, หรือ Docker เองเด็ดขาด!** คุณ (Claude Code) ต้องเป็นคนรันคำสั่งเหล่านั้นให้ทั้งหมดตั้งแต่ต้นจนจบ
- สื่อสารกับผู้ใช้ด้วย **ภาษาไทยที่เข้าใจง่าย กระชับ เน้นผลลัพธ์ทางธุรกิจและหน้าจอการใช้งาน**

---

## 🔄 2. MANDATORY SESSION STARTUP PROTOCOL (ทำอัตโนมัติทุกครั้งที่เปิดโปรแกรม)

ทุกครั้งที่เริ่มต้นบทสนทนาใหม่ หรือเมื่อผู้ใช้พิมพ์ว่า **"เริ่มงานวันนี้"** คุณต้องทำ 4 ขั้นตอนนี้อัตโนมัติทันที:

1. **ดึงโค้ดล่าสุดจากเซิร์ฟเวอร์กลางของบริษัท:**
   ```bash
   git fetch origin
   git checkout feat/flow-cfo || git checkout -b feat/flow-cfo origin/develop
   git pull origin develop --no-edit
   ```
2. **อ่านไฟล์สมองของระบบทั้ง 5 ไฟล์ตามลำดับ:**
   - `HANDOFF.md` (ดูว่าล่าสุดทีม Security/IT หรือเรามีการส่งมอบงานอะไรไว้)
   - `MEMORY.md` (ดูกฎเหล็กทางธุรกิจและการคำนวณการเงิน)
   - `TASKS.md` (ดูรายการงานที่ค้างอยู่ในส่วนของ Track B)
   - `PRD.md` (ดูขอบเขตระบบ 10 เมนู, 7 Setup Steps, S1–S8, 19 แบบฟอร์ม F-00..F-18)
   - `AGENTS.md` (ดูกฎการแบ่งเขตโฟลเดอร์)
3. **ตรวจสอบว่าระบบรันอยู่หรือยัง:**
   - รันเซิร์ฟเวอร์ให้ผู้ใช้เปิดดูได้ที่ `http://localhost:8080` (ผ่าน `docker compose up -d --build`) หรือ `http://localhost:3000` (ผ่าน `cd app && npm start`)
4. **สรุปสั้นๆ ให้ผู้ใช้ฟังเป็นภาษาไทย:**
   - บอกว่าดึงข้อมูลล่าสุดเรียบร้อยแล้ว ล่าสุดทำอะไรเสร็จไป และวันนี้มีหัวข้อไหนใน `TASKS.md` ที่พร้อมทำต่อ

---

## 🚧 3. STRICT FOLDER BOUNDARIES (เขตพื้นที่ที่อนุญาตให้แก้ไขได้ vs ห้ามแตะต้อง)

เพื่อป้องกันโค้ดชนกัน (Git Conflict) กับทีม IT/Security (Track A):

### ✅ โฟลเดอร์ที่อนุญาตให้คุณแก้ไขได้เต็มที่ (Track B — CFO Area):
- **`app/public/index.html`** — หน้าจอการทำงานทั้งหมด 10 เมนูหลัก, ขั้นตอนตั้งค่าโครงการ 7 ขั้นตอน, งานติดตั้ง `S1`–`S8`, มุมบัญชี POC, กระแสเงินสด Cashflow, และแบบฟอร์มพิมพ์ `F-00` ถึง `F-18`
- **`app/src/workflow/finance-engine.js`** — สูตรคำนวณการเงิน 8-Step Waterfall, ใบแจ้งหนี้ลูกค้า, POC, Cashflow
- **`app/src/workflow/collections-api.js`** — API จัดการข้อมูล 22 Collections ทางธุรกิจ
- **`HANDOFF.md`**, **`TASKS.md`**, **`TASK.md`**, **`MEMORY.md`**, **`PRD.md`** — เอกสารส่งมอบงานและรายการงาน

### ⛔ โฟลเดอร์ที่ห้ามแก้ไขเด็ดขาด (Track A — IT & Security Area):
- **`app/src/security/`** (`ciam.js`, `rbac.js`, `headers.js`, `copilot.js`)
- **`app/src/db/postgres.js`**
- **`app/public/js/ciam-admin-panel.js`**, **`app/public/js/apex-cloud-bridge.js`**
- **`auth-proxy/`**, **`.github/workflows/`**, **`docker-compose.yml`**, **`scripts/`**

---

## 🧪 4. MANDATORY PRE-PUSH LOCAL COMPILE & CLOSE PROTOCOL (กฎเหล็กก่อนส่งงานขึ้น Git)

ทุกครั้งที่แก้ไขโค้ดเสร็จ หรือเมื่อผู้ใช้พิมพ์ว่า **"จบงานวันนี้"** / **"ส่งโค้ดขึ้นระบบ"**:

1. **ต้อง Compile และทดสอบบนเครื่อง Local ว่าไม่มี Error 100% ก่อนเสมอ:**
   ```bash
   node --check app/index.js
   node --check app/src/workflow/finance-engine.js
   node --check app/src/workflow/collections-api.js
   ```
   - หากมี Docker เปิดอยู่ ให้ทดสอบ Build (`docker compose build`) เพื่อให้มั่นใจว่าเมื่อขึ้น GitHub จะผ่านด่านตรวจ `Security & Governance Gatekeeper` 100%
   - **หากพบ Error แม้แต่จุดเดียว ห้าม `git push` เด็ดขาด!** ต้องซ่อมจนกว่าจะผ่าน 100% ก่อน
2. **อัปเดตเอกสารส่งมอบงานเสมอ:**
   - อัปเดตสถานะงานใน **`TASKS.md`** และ **`TASK.md`** ให้ตรงกัน
   - เขียนสรุปสิ่งที่ทำเสร็จในวันนี้ลงใน **`HANDOFF.md`** (ระบุวันที่ เวลา ผู้ส่งมอบ: CFO / Track B และก้าวต่อไป)
3. **Commit และ Push ขึ้นกิ่งของ CFO (`feat/flow-cfo` และซิงค์ `develop`):**
   ```bash
   git add app/src/workflow/ app/public/index.html HANDOFF.md TASKS.md TASK.md MEMORY.md PRD.md
   git commit -m "feat(flow): <สรุปสิ่งที่แก้ไขสั้นๆ>"
   git push -u origin feat/flow-cfo
   ```
   *(ห้าม Push ตรงเข้ากิ่ง `main` เด็ดขาด เพราะกิ่ง `main` สงวนไว้สำหรับเปิด Pull Request ให้ทีม IT ตรวจอนุมัติขึ้น Production เท่านั้น)*
