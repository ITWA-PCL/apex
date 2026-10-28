# MEMORY.md — Project Agreements, Constraints & Institutional Knowledge

> **Project:** **APEX** (`https://apex.windowasia.com`)
> **Owner:** บริษัท วินโดว์ เอเชีย จำกัด (มหาชน) (Window Asia Public Company Limited)
> **Last Updated:** 2026-10-28

---

## 1. ข้อตกลงพื้นฐานของโปรเจกต์ (Core Working Agreements)

1. **ชื่อโปรเจกต์และโดเมน:**
   - ชื่อโปรเจกต์อย่างเป็นทางการ: **`APEX`**
   - เว็บไซต์ Production: **`https://apex.windowasia.com`**
   - รหัสแอปพลิเคชันในระบบ Central IAM (`app_code`): **`apex`**
2. **โครงสร้างทีมและการทำงานข้ามเครื่อง (Multi-Machine Collaboration):**
   - **Lead Security & Core Architect (คุณ):** ดูแลระบบ Security, Authentication, Central IAM v2.9.0 Integration, RBAC 37 Permissions, Audit Logs (ISO 27001), Infrastructure & Docker Cache Cleanup
   - **Business Process Lead (CFO):** ดูแลระบบ Process Flow (10 เมนูหลัก, 7 Setup Steps, S1–S8), ระบบการเงิน (Waterfall Claims, Customer Invoices, POC, Cashflow), และแบบฟอร์มพิมพ์ F-00 ถึง F-18
   - **การซิงค์โค้ดระหว่างเครื่อง:** เนื่องจากโฟลเดอร์ทำงานอยู่บน Local คนละเครื่อง ทั้งสองฝั่งจะซิงค์โค้ดและไฟล์เอกสาร (`HANDOFF.md`, `TASK.md`, `MEMORY.md`, `PRD.md`) ผ่าน **Git Remote (GitHub / GitLab Private Repo)**
   - **Day 1 Bootstrap Rule:** ก่อนที่ CFO จะเริ่มเขียน Process Flow ในวันถัดไป เราจะสร้าง **Shared Core Skeleton** (Database Schema + Auth/RBAC Mock Guard + UI Shell ตาม `install-tracker_26.html`) ขึ้น Git ก่อน เพื่อให้ CFO ดึง (`git pull`) ไปพัฒนาต่อได้ทันทีโดยไม่ต้องรอระบบ CIAM จริงเสร็จ 100%
3. **การจัดการขยะและ Cache (Weekly Cache Cleanup):**
   - ทุกๆ สัปดาห์ (วันอาทิตย์ เวลา 03:00 น. บนเซิร์ฟเวอร์ หรือรันผ่าน `scripts/cleanup-cache.ps1` / `scripts/cleanup-cache.sh`) ระบบจะล้าง Docker build cache (`docker builder prune`), dangling images, stopped containers, Next.js build cache และ Python cache อัตโนมัติ

---

## 2. สถาปัตยกรรมและเทคโนโลยีที่ตกลงใช้ (Approved Tech Stack)

| เลเยอร์ | เทคโนโลยี | เหตุผลหลัก |
| :--- | :--- | :--- |
| **Frontend (Desktop & Mobile PWA)** | **Next.js (App Router) + React + TypeScript + Tailwind CSS** | เร็ว รองรับ PWA ติดตั้งลงมือถือได้ ถ่ายรูปหน้างาน/เซ็นชื่อบนจอสัมผัสได้ และถอดดีไซน์จาก `install-tracker_26.html` ได้ 100% |
| **Backend API** | **Python 3.12 + FastAPI (Async) + Pydantic v2 + SQLAlchemy 2.0** | ประสิทธิภาพสูงระดับเดียวกับ Node/Go มีโค้ดต้นแบบตรงกับสเปก `CIAM_SPOKE_ENTERPRISE_INTEGRATION_SPECIFICATION_v2.9.0.md` และคำนวณสูตรการเงิน/บัญชีของ CFO ได้แม่นยำด้วย `Decimal` |
| **Database** | **PostgreSQL 16+** | รองรับ ACID Transaction สำหรับการเบิกงวด/POC, Row-Level Security, และเก็บ JSONB สำหรับ Checklist/Hold Points |
| **Cache & Queue** | **Redis 7+** | จัดการ Session, PKCE State, Rate Limiting และ Background Jobs |
| **File Storage** | **S3-Compatible Object Storage (Cloud Storage / MinIO)** | เก็บรูปถ่ายหน้างาน (ก่อน/หลัง), ไฟล์แบบก่อสร้าง PDF, และลายเซ็นดิจิทัล |
| **Container & Proxy** | **Docker Compose + Nginx / Traefik (TLS 1.3)** | มาตรฐาน Cloud Production พร้อม Security Headers ตาม ISO/IEC 27001:2022 |

---

## 3. กฎทางธุรกิจและการคำนวณการเงินที่ห้ามผิดพลาด (Critical Business & Financial Rules)

1. **ค่าขนส่ง (`delivery`):**
   - **ไม่มี VAT 7% เสมอ** (ยกเว้นภาษีมูลค่าเพิ่มสำหรับค่าขนส่งในทุกใบเสนอราคาและใบแจ้งหนี้)
2. **สูตรคำนวณใบเบิกงวดช่างรับเหมา 8 ขั้นตอน (Contractor Claim Waterfall — `F-12`):**
   - **ขั้นที่ 1:** มูลค่างานงวดนี้ (`workValue`) = $\sum (\text{จำนวนบานที่ผ่านขั้นย่อย} \times \text{อัตราค่าแรงต่อบาน} \times \text{สัดส่วน \% ขั้นย่อย})$
   - **ขั้นที่ 2:** หักคืนเงินมัดจำ (`depDeduct`) — เลือกได้ 2 วิธีตามสัญญาจ้าง (`engagements.depMethod`):
     - `prop` (หักตามสัดส่วนผลงาน): $\min(\text{เงินมัดจำคงเหลือ}, \text{workValue} \times \frac{\text{เงินมัดจำตั้งต้น}}{\text{มูลค่าสัญญารวม}})$
     - `first` (หักเต็มจำนวนตั้งแต่งวดแรก): $\min(\text{เงินมัดจำคงเหลือ}, \text{workValue})$
   - **ขั้นที่ 3:** หักเงินชะลอตรวจรับ (`holdbackDeduct`) = $\text{workValue} \times \frac{\text{holdPct}}{100}$ (ถ้ายังตรวจรับไม่ครบ 100%)
   - **ขั้นที่ 4:** **ฐานภาษี (`taxBase`)** = $\max(0, \text{workValue} - \text{depDeduct} - \text{holdbackDeduct})$
   - **ขั้นที่ 5:** บวก **VAT 7%** = $\text{taxBase} \times 0.07$ *(เฉพาะกรณีทีมช่างจดทะเบียน VAT เท่านั้น)*
   - **ขั้นที่ 6:** หัก **ภาษีหัก ณ ที่จ่าย (WHT)** = $\text{taxBase} \times \frac{\text{whtRate}}{100}$ *(คำนวณจากฐานภาษีก่อน VAT)*
   - **ขั้นที่ 7:** หัก **เงินประกันผลงาน (`retentionDeduct`)** = $\text{workValue} \times \frac{\text{retPct}}{100}$ *(คำนวณจากมูลค่างานเต็ม `workValue` ขั้นที่ 1 ไม่ใช่ฐานภาษี)*
   - **ขั้นที่ 8:** **ยอดจ่ายสุทธิ (`netPay`)** = $\text{taxBase} + \text{VAT} - \text{WHT} - \text{retentionDeduct}$
3. **กฎเหล็กหนังสือรับรองคืนเงินประกันผลงาน (`F-17` Retention Release Certificate):**
   - วันที่เริ่มนับระยะเวลารับประกันผลงานของทีมช่าง **ต้องใช้วันที่ตรวจรับครบทุกบานของทีมนั้น (`allAccDate(project, team)`) เท่านั้น**
   - **ห้าม**ออกหนังสือรับรอง `F-17` หากยังมีช่องเปิดของทีมช่างนั้นที่ยังตรวจรับไม่ครบ 100% หรือวันที่ออกเอกสารย้อนหลังก่อน `allAccDate`
4. **กฎเหล็กการปิดโครงการ (`S8` Project Closure):**
   - โครงการจะปิด (`S8`) ได้ ต้องผ่าน **7 Auto-Checks** (เช่น ช่องเปิดครบ 100%, NCR ปิดครบ 100%, ส่งมอบครบ, เบิกงวดครบ) และแนบ **6 เอกสารปิดโครงการ** ครบถ้วน
5. **รูปแบบปี พ.ศ. ในเอกสารพิมพ์ (`F-00` ถึง `F-18`):**
   - เอกสารราชการและใบสำคัญทั้งหมดต้องแสดงปีเป็น **พุทธศักราช (พ.ศ. = ค.ศ. + 543)**

---

## 4. กฎด้านความปลอดภัยและ CIAM v2.9.0 (Security & CIAM Rules)

1. **โดเมนและ Callback ของ APEX:**
   - Production Origin: `https://apex.windowasia.com`
   - SSO Start Endpoint: `https://apex.windowasia.com/auth/start`
   - SSO Callback Endpoint: `https://apex.windowasia.com/api/auth/sso/callback`
2. **Audit Log Codes ที่ต้องบันทึกใน `transaction_logs`:**
   - `SSO-01`: ล็อกอินผ่าน Central IAM สำเร็จ
   - `SSO-02`: ล็อกอินล้มเหลว / Token ไม่ถูกต้อง
   - `SSO-03`: ออกจากระบบ (Logout)
   - `SSO-04`: บล็อกการเข้าสู่ระบบเนื่องจากบัญชีถูกระงับ (`is_active == false`)
   - `BG-01` / `BG-02`: เปิด/ปิดโหมดฉุกเฉิน Break-Glass (`http://172.18.0.1:3100`)
   - `CFG-01`: แก้ไขค่าตั้งต้น CIAM / AI Copilot ในตาราง `system_settings`
3. **IP Whitelist สำหรับ Push Provisioning (Group C):**
   - อนุญาตเฉพาะ IP ของ Central IAM Server (`157.173.219.153` หรือค่าที่ตั้งไว้ใน `system_settings.ciam_allowed_ips`) พร้อม Header `X-Management-API-Key`
