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
2. **ห้ามขอให้ผู้ใช้พิมพ์คำสั่ง Git เอง** — Claude จัดการขั้นตอนเทคนิคให้
   - เครื่องของ CFO มี **Claude Code** และ **Google Chrome** ติดตั้งอยู่แล้ว
   - หากเครื่องยังไม่มี `git`, `node` (Node.js LTS) หรือเครื่องมืออื่น **ห้ามติดตั้งหรือเปลี่ยนการตั้งค่าเครื่องอัตโนมัติ** ให้แจ้ง CFO / IT สั้น ๆ ว่าขาดอะไร (แทนที่คำสั่ง `winget install` อัตโนมัติเดิม ตาม AGENTS.md หัวข้อ 4)
3. **นโยบายอีเมล GitHub ของ CFO (Personal Email Allowed):**
   - CFO สามารถใช้อีเมลส่วนตัวใดก็ได้ (เช่น `@gmail.com`, `@hotmail.com`, `@outlook.com`) ในการสมัครและใช้งาน GitHub เพื่อความสะดวกและเพื่อให้บัญชี GitHub นั้นเป็นสมบัติติดตัวของ CFO ตลอดไป แม้ในอนาคตจะไม่ได้ทำงานร่วมกับ Window Asia (WA) แล้วก็ตาม (เนื่องจากสิทธิ์การเข้าถึงโค้ด `ITWA-PCL/apex` ควบคุมผ่าน Collaborator Permission ของ Repository)
4. **โฟลเดอร์ทำงานหลักบนเครื่อง Local:**
   - ตรวจ Git repository root ของโฟลเดอร์ที่เปิดอยู่จริงทุกครั้ง อย่าเดาว่าต้องเป็น `D:\Python\APEX` (เครื่อง CFO ปัจจุบันอยู่ที่ `D:\Git\apex`) หากไม่ใช่ repo `ITWA-PCL/apex` ให้หยุดและแจ้ง IT ไม่ clone หรือสร้าง repo ใหม่อัตโนมัติ
   - ควรอยู่บน `Drive D:` เพื่อประหยัดพื้นที่ `Drive C:`
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

ทุกครั้งที่เริ่มต้นบทสนทนาใหม่ หรือเมื่อผู้ใช้พิมพ์ว่า **"เริ่มงานวันนี้"** ทำตาม **AGENTS.md หัวข้อ 4 (CFO / Track B)** ดังนี้:

1. **ตรวจ repo และงานค้างก่อน แล้วจึงอัปเดตแบบปลอดภัย:**
   - ตรวจ repository root, remote (`ITWA-PCL/apex` เท่านั้น), branch ปัจจุบัน (`feat/flow-cfo`), `git status` ทั้ง tracked/untracked และ merge/rebase ที่ค้าง
   - หากมีงานค้างที่ไม่ใช่ของ session นี้ หรือไม่อยู่บน `feat/flow-cfo` ให้หยุดแจ้ง IT ห้าม stash / reset / clean
   - `git fetch origin` แล้วอัปเดตกิ่ง `feat/flow-cfo` จาก remote ได้เฉพาะแบบ fast-forward เท่านั้น **ไม่ pull `develop` อัตโนมัติ** (คำสั่ง `git pull origin develop` และการสร้างกิ่งจาก `develop` เดิมยกเลิกแล้ว)
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

## 🧪 5. CFO DELIVERY PROTOCOL — "ส่งงาน" (Push-only ตาม AGENTS.md หัวข้อ 4)

**จบ session ≠ ส่งงาน:** ไม่ commit / push อัตโนมัติเมื่อจบงาน ทำเฉพาะเมื่อ CFO สั่ง **"ส่งงาน"** หรืออนุญาตส่งงานส่วนที่ระบุชัดเจน
(คำสั่งเดิมที่ให้ส่งทุกครั้งที่จบ session, `git add` ทั้งโฟลเดอร์ และ `node scripts/open-pr.js` อัตโนมัติ ยกเลิกแล้ว — ไม่ได้เปลี่ยนสคริปต์ของทีมเทคนิค)

เมื่อ CFO สั่ง "ส่งงาน":
1. ตรวจ repository root, remote และ branch อีกครั้ง ต้องเป็น `feat/flow-cfo` เท่านั้น ตรวจ tracked/untracked/staged diff แยกงานของ session นี้ออกจากงานเดิม ไม่แน่ใจที่มาให้หยุด
2. `git fetch origin` หาก remote นำหน้าหรือประวัติแยกกัน ให้หยุดให้ทีมเทคนิคช่วย ไม่ rebase / force-push
3. ทบทวน diff ว่าอยู่ในเขต Track B ไม่มีข้อมูลลับ อัปเดต `HANDOFF.md`, `TASK.md`, `TASKS.md`
4. **รัน `node scripts/verify-local.js` และการทดสอบที่ตรงกับส่วนที่แก้** — หาก fail หรือรันไม่ได้ ห้าม push ให้หยุดรายงาน (ไม่แก้ security/scripts เพื่อให้ผ่าน)
5. Stage ทีละไฟล์ด้วยชื่อชัดเจน ตรวจ `git diff --cached` แล้ว commit เช่น `feat(flow): add payment approval step`
6. Dry-run แล้วจึง push ด้วย refspec ชัดเจน และยืนยัน SHA กับ remote จริง:
   ```powershell
   git -c push.followTags=false push --dry-run origin HEAD:refs/heads/feat/flow-cfo
   git -c push.followTags=false push origin HEAD:refs/heads/feat/flow-cfo
   git rev-parse HEAD
   git ls-remote --heads origin refs/heads/feat/flow-cfo
   ```
7. หยุดหลังรายงาน **ไม่รัน `scripts/open-pr.js` ไม่เปิด PR ไม่ merge ไม่ deploy** ทีมเทคนิคจัดการ PR / CI / review / merge / deploy เอง

การล้าง cache (`scripts/cleanup-cache.ps1`) ลบ Docker images ที่ไม่ได้ใช้ทั้งเครื่อง — รันเมื่อ CFO อนุญาตเท่านั้น
