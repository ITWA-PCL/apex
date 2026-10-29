# PRD.md — Product Requirements Document: APEX

> **ชื่อระบบ (System Name):** **APEX** — ระบบควบคุมงานติดตั้งประตู-หน้าต่าง (Door & Window Installation Control System)
> **องค์กร (Owner):** บริษัท วินโดว์ เอเชีย จำกัด (มหาชน) — Window Asia Public Company Limited
> **เว็บไซต์ (Production URL):** `https://apex.windowasia.com`
> **เอกสารอ้างอิงต้นฉบับใน `Docs/`:**
> 1. [install-tracker_26.html](file:///D:/Python/APEX/Docs/install-tracker_26.html) (UI/UX & Functional Mockup ต้นฉบับ)
> 2. [สรุประบบควบคุมงานติดตั้ง_สำหรับทำอินโฟกร.md](file:///D:/Python/APEX/Docs/%E0%B8%AA%E0%B8%A3%E0%B8%B8%E0%B8%9B%E0%B8%A3%E0%B8%B0%E0%B8%9A%E0%B8%9A%E0%B8%84%E0%B8%A7%E0%B8%9A%E0%B8%84%E0%B8%B8%E0%B8%A1%E0%B8%87%E0%B8%B2%E0%B8%99%E0%B8%95%E0%B8%B4%E0%B8%94%E0%B8%95%E0%B8%B1%E0%B9%89%E0%B8%87_%E0%B8%AA%E0%B8%B3%E0%B8%AB%E0%B8%A3%E0%B8%B1%E0%B8%9A%E0%B8%97%E0%B8%B3%E0%B8%AD%E0%B8%B4%E0%B8%99%E0%B9%82%E0%B8%9F%E0%B8%81%E0%B8%A3.md)
> 3. [สรุประบบควบคุมงานติดตั้ง_สำหรับผู้บริหาร_.md](file:///D:/Python/APEX/Docs/%E0%B8%AA%E0%B8%A3%E0%B8%B8%E0%B8%9B%E0%B8%A3%E0%B8%B0%E0%B8%9A%E0%B8%9A%E0%B8%84%E0%B8%A7%E0%B8%9A%E0%B8%84%E0%B8%B8%E0%B8%A1%E0%B8%87%E0%B8%B2%E0%B8%99%E0%B8%95%E0%B8%B4%E0%B8%94%E0%B8%95%E0%B8%B1%E0%B9%89%E0%B8%87_%E0%B8%AA%E0%B8%B3%E0%B8%AB%E0%B8%A3%E0%B8%B1%E0%B8%9A%E0%B8%9C%E0%B8%B9%E0%B9%89%E0%B8%9A%E0%B8%A3%E0%B8%B4%E0%B8%AB%E0%B8%B2%E0%B8%A3_.md)
> 4. [CIAM_SPOKE_ENTERPRISE_INTEGRATION_SPECIFICATION_v2.9.0.md](file:///D:/Python/APEX/Docs/CIAM_SPOKE_ENTERPRISE_INTEGRATION_SPECIFICATION_v2.9.0.md)

---

## 1. วิสัยทัศน์และวัตถุประสงค์ของระบบ (Product Vision & Objectives)

**APEX (`apex.windowasia.com`)** คือแพลตฟอร์มเว็บแอปพลิเคชันแบบ **Progressive Web App (PWA)** บนระบบ Cloud สำหรับบริหารและควบคุมงานติดตั้งประตู-หน้าต่างของ **บริษัท วินโดว์ เอเชีย จำกัด (มหาชน)** แบบครบวงจร (End-to-End) ตั้งแต่การประมูลราคา การเปิดโครงการ การควบคุมคุณภาพระดับ **"รายช่องเปิด (1 บาน)"** ไปจนถึงการเบิกจ่ายเงินผู้รับเหมา การวางบิลลูกค้า และการรับรู้รายได้ทางบัญชี (POC)

### เป้าหมายหลัก 4 ประการ:
1. **Single Source of Truth รายช่องเปิด:** ติดตามสถานะประตู-หน้าต่างทุกบาน (ชั้น, อาคาร, ยูนิต, รหัสสินค้า, ทีมช่าง, สถานะย่อย, รูปถ่าย, ลายเซ็นตรวจรับ) แบบ Real-time ทั้งบน Desktop ในออฟฟิศ และ Mobile ที่หน้างานก่อสร้าง
2. **Financial & Accounting Integrity:** เชื่อมโยงผลงานติดตั้งจริงหน้างานเข้ากับการคำนวณใบเบิกงวดช่าง (8-Step Waterfall), การวางบิลลูกค้า, รายงานความสำเร็จตามสัญญา (POC), และกระแสเงินสด (Cashflow) โดยไม่มีการจ่ายเงินเกินผลงานจริง
3. **Zero-Defect Quality Control (Hold Points & NCR):** บังคับจุดตรวจสอบคุณภาพ (Hold Points ◆) และการปิดใบแจ้งงานไม่เป็นไปตามข้อกำหนด (NCR) ก่อนอนุญาตให้ข้ามขั้นตอนหรือปิดโครงการ
4. **Enterprise Security (ISO/IEC 27001:2022 & CIAM v2.9.0):** เชื่อมต่อระบบยืนยันตัวตนกลางของ Window Asia (`ciam.windowasia.com`), ควบคุมสิทธิ์ระดับละเอียด 10 บทบาท × 37 สิทธิ์ และบันทึก Audit Log ทุกธุรกรรมสำคัญ

---

## 2. โครงสร้างระบบ 10 เมนูหลัก (10 Core Navigation Modules)

อ้างอิงตาม `Docs/install-tracker_26.html`:

| ลำดับ | รหัสเมนู | ชื่อเมนู (TH / EN) | รายละเอียดฟังก์ชันหลัก |
| :---: | :--- | :--- | :--- |
| **1** | `dashboard` | **แดชบอร์ด (Executive & Operational Dashboard)** | KPI Cards (โครงการทั้งหมด, ช่องเปิดรวม, ความคืบหน้าเฉลี่ย, NCR ค้าง), กราฟแท่งเปรียบเทียบโครงการ, แจ้งเตือนงานค้าง/เกินกำหนด |
| **2** | `bidding` | **ประมูลงาน (Bidding & Estimation)** | บริหารใบประมูลงาน (`bids`), ถอดปริมาณช่องเปิด, คำนวณต้นทุนสินค้า + ค่าแรง + ค่าขนส่ง (ไม่มี VAT) + กำไรเป้าหมาย, พิมพ์ `F-00` ใบสรุปราคาประมูล, โอนเป็นโครงการเมื่อชนะประมูล |
| **3** | `projects` | **โครงการ (Project Management & 7-Step Setup)** | จัดการโครงการทั้งหมด, Wizard ตั้งค่าโครงการ 7 ขั้นตอน (`setupSteps`), จัดการใบสั่งขาย (`sales`), แผนงบประมาณ/Cost Sheet (`budgets`, `F-11`), ใบตกลงจ้างทีมช่าง (`engagements`, `F-08`), ใบเบิกงวดช่าง (`claims`, `F-12`), ใบแจ้งหนี้ลูกค้า (`cinvoices`, `F-13`), ใบส่งมอบงาน (`handovers`, `F-06`) |
| **4** | `install` | **งานติดตั้ง (Installation Matrix S1–S8)** | ตารางควบคุมงานติดตั้ง 8 ขั้นตอน (`S1`–`S8`), ตาราง Matrix รายช่องเปิด (`openings`), อัปเดตขั้นย่อยของบานประตู-หน้าต่าง (`pending` → `doing` → `done` → `accepted` / `defect`), บันทึกรายงานประจำวัน (`dailies`), พิมพ์ฟอร์มหน้างาน (`F-01`–`F-07`, `F-16`) |
| **5** | `ncr` | **NCR & ปัญหาหน้างาน (NCR & Site Issues)** | ทะเบียนใบ NCR (`ncrs`, `F-04`) แยกระดับความรุนแรง (`Critical`, `Major`, `Minor`), ติดตามการแก้ไขและตรวจซ้ำ, ทะเบียนปัญหาหน้างาน (`issues`) |
| **6** | `teams` | **ทีมช่าง & ต้นทุน (Contractor Teams & Cost Master)** | ทะเบียนทีมช่างรับเหมา (`teams`), ข้อมูลภาษี (VAT / WHT / เงินประกันผลงาน), ตารางประเมินเกรดช่าง (`A`, `B`, `C`), ฐานข้อมูลราคาวัสดุ (`materials`), อัตราค่าแรงมาตรฐาน (`labor`), ค่าใช้จ่ายอื่น (`others`), ลูกค้า (`customers`) |
| **7** | `reports` | **รายงาน & การเงิน (Financial, POC & Executive Reports)** | รายงาน 6 หมวดใหญ่: (1) ภาพรวมความคืบหน้าโครงการ, (2) รายงานการเงิน & กำไรขั้นต้น, (3) รายงานความสำเร็จตามสัญญา **POC** (`F-14`), (4) รายงานกระแสเงินสด **Cashflow** (`F-15`), (5) ประสิทธิภาพทีมช่าง & หนังสือรับรองคืนเงินประกัน (`F-17`), (6) สรุป NCR & คุณภาพ |
| **8** | `admin` | **จัดการระบบ & สิทธิ์ (RBAC, Users & CIAM Settings)** | จัดการผู้ใช้งาน (`users`), ตารางสิทธิ์ 10 บทบาท × 37 สิทธิ์ (`roles`), กำหนดสิทธิ์เฉพาะรายบุคคล (`grant`/`deny` overrides), ผูกโครงการที่รับผิดชอบ, ตั้งค่า **Central IAM SSO (v2.9.0)**, ตั้งค่าบริษัทและงวดงานมาตรฐาน (`settings`), พิมพ์ `F-18` รายงานสิทธิ์ผู้ใช้ |
| **9** | `manual` | **คู่มือการใช้งาน (Interactive User Manual)** | คู่มืออธิบายขั้นตอนการทำงาน 7 Setup Steps, S1–S8, วิธีคิดเงินเบิกงวด และความหมายของสถานะต่างๆ ในระบบ |
| **10** | `ai_copilot` | **AI ผู้ช่วยวิเคราะห์ข้อมูล (Read-Only AI Copilot)** | ผู้ช่วย AI ถาม-ตอบข้อมูลโครงการ ความคืบหน้า งบประมาณ และ NCR แบบ Read-Only ภายใต้สิทธิ์ RBAC ของผู้ใช้งานตามมาตรฐาน CIAM Group E |

---

## 3. กระบวนการทำงานมาตรฐาน (Standard Operating Workflows)

### 3.1 ขั้นตอนการตั้งค่าโครงการ 7 ขั้นตอน (`7-Step Project Setup Wizard`)
ก่อนเริ่มบันทึกงานติดตั้ง โครงการต้องตั้งค่าผ่าน 7 ขั้นตอนตามลำดับ:
1. **ข้อมูลโครงการ (`Step 1: Project Info`)** — ชื่อโครงการ, ลูกค้า, ประเภทโครงการ (แนวราบ/คอนโด/บ้านเดี่ยว), วันที่เริ่ม-สิ้นสุด, PM/โฟร์แมนที่รับผิดชอบ
2. **ใบสั่งขาย / สัญญาลูกค้า (`Step 2: Sales Orders`)** — มูลค่าสินค้า, ค่าบริการติดตั้ง, ค่าขนส่ง (ไม่มี VAT 7%), เงื่อนไขการวางบิลลูกค้า
3. **งบประมาณโครงการ (`Step 3: Budget / Cost Sheet`)** — ตั้งงบประมาณต้นทุนสินค้า, ค่าแรงติดตั้ง, ค่าขนส่ง, ค่าใช้จ่ายบริหารโครงการ (`F-11`)
4. **แบบก่อสร้าง & รายการช่องเปิด (`Step 4: Drawings & Openings`)** — อัปโหลดแบบ Shop Drawing (`drawings`) และสร้างรายการช่องเปิดทุกบาน (`openings`: อาคาร/โซน, ชั้น, ยูนิต, รหัสบาน, ประเภทบาน, ขนาด กว้าง×สูง)
5. **กำหนดขั้นตอนย่อยของบาน (`Step 5: Opening Sub-steps`)** — กำหนดขั้นตอนการติดตั้งย่อยและสัดส่วน % เบิกจ่ายของแต่ละขั้นตอนย่อย (รวมกัน = 100%)
6. **มอบหมายทีมช่าง & ใบตกลงจ้าง (`Step 6: Team Assignment & Engagement`)** — ผูกทีมช่างเข้ากับช่องเปิด กำหนดอัตราค่าแรงต่อบาน เงินมัดจำ เงินชะลอตรวจรับ (`holdPct`) เงินประกันผลงาน (`retPct`) และออกใบตกลงจ้าง (`F-08` / `F-09` / `F-10`)
7. **ตรวจสอบความพร้อมก่อนเริ่มงาน (`Step 7: Readiness Activation`)** — ตรวจสอบความครบถ้วนและเปลี่ยนสถานะโครงการเป็นกำลังดำเนินการ

### 3.2 ขั้นตอนการควบคุมงานติดตั้ง 8 ขั้นตอน (`S1`–`S8` & Hold Points ◆)
| รหัส | ชื่อขั้นตอน | ประเภท | เงื่อนไขสำคัญ / แบบฟอร์มที่เกี่ยวข้อง |
| :---: | :--- | :---: | :--- |
| **`S1`** | เตรียมความพร้อมและวางแผน (Preparation & Planning) | ปกติ | ตรวจสอบแบบ, แผนงาน, รายชื่อทีมช่างเข้าพื้นที่ (`F-09`) |
| **`S2`** | สำรวจหน้างานและวัดช่องปูน (Site Survey & Opening Check) | **◆ Hold Point** | ต้องตรวจขนาดช่องปูน/ระดับดิ่ง-ฉาก (`F-01`) ผ่านก่อนสั่งผลิตหรือนำบานเข้า |
| **`S3`** | ตรวจรับสินค้าเข้าหน้างาน (Material Delivery & Inspection) | **◆ Hold Point** | ตรวจนับจำนวนและสภาพบานประตู-หน้าต่าง (`F-02`) ห้ามติดตั้งบานที่ชำรุด |
| **`S4`** | ติดตั้งวงกบและบาน (Frame & Sash Installation) | ปกติ | ติดตามความคืบหน้ารายช่องเปิด (`openings`) และบันทึกเวลาทำงาน (`timesheets`, `F-16`) |
| **`S5`** | ติดตั้งอุปกรณ์และซีลซิลิโคน (Hardware & Sealing) | ปกติ | ติดตั้งมือจับ ล็อก ยางกันซึม ซิลิโคน และทำความสะอาดบาน |
| **`S6`** | ตรวจสอบคุณภาพภายใน (Internal QC Inspection) | **◆ Hold Point** | QC ตรวจทุกบาน (`F-03`, `F-07`) หากพบ Defect ต้องเปิด **NCR (`F-04`)** และแก้ให้ผ่าน (`F-05`) |
| **`S7`** | ส่งมอบงานลูกค้า (Customer Handover & Acceptance) | **◆ Hold Point** | เดินตรวจร่วมกับลูกค้าและลงนามใบส่งมอบงาน (`F-06`) เพื่อปลดล็อกการวางบิลและคืนเงินประกัน |
| **`S8`** | ปิดโครงการ (Project Closure) | **◆ Hold Point** | ต้องผ่าน **7 Auto-Checks** + แนบ **6 เอกสารปิดโครงการ** ครบถ้วนจึงจะปิดโครงการได้ |

---

## 4. โครงสร้างข้อมูลหลัก 22 Collections / ตารางฐานข้อมูล (Data Model)

ระบบจัดเก็บข้อมูลใน PostgreSQL ครอบคลุม 22 กลุ่มข้อมูลหลัก (พร้อมตารางระบบ CIAM):
1. `projects` — ข้อมูลโครงการ, สถานะ `S1`–`S8`, เช็กลิสต์ตั้งค่า 7 ขั้นตอน, เช็กลิสต์ปิดโครงการ
2. `openings` — ข้อมูลประตู-หน้าต่างรายบาน, โซน/ชั้น/ยูนิต, ทีมช่าง, สถานะขั้นตอนย่อย (`subSteps`), วันที่ตรวจรับ (`acceptedDate`)
3. `bids` — ใบประมูลราคาและตารางถอดปริมาณงานก่อนเปิดโครงการ
4. `customers` — ข้อมูลลูกค้า, เลขประจำตัวผู้เสียภาษี, ผู้ติดต่อ
5. `sales` — ใบสั่งขาย (Sales Orders), มูลค่าสินค้า/ค่าติดตั้ง/ค่าขนส่ง
6. `budgets` — แผนงบประมาณโครงการ (Cost Sheet)
7. `drawings` — ทะเบียนแบบก่อสร้าง (Shop Drawings) และ Revision
8. `materials` — ฐานข้อมูลราคาวัสดุ/สินค้าประตู-หน้าต่างมาตรฐาน
9. `labor` — ฐานข้อมูลอัตราค่าแรงติดตั้งมาตรฐานตามประเภทบาน
10. `others` — ฐานข้อมูลค่าใช้จ่ายอื่นๆ (เช่น ค่าขนส่ง, นั่งร้าน, เครน)
11. `teams` — ข้อมูลทีมช่างรับเหมา, ประเภทภาษี, อัตรา WHT, เกรดคุณภาพ
12. `engagements` — สัญญา/ใบตกลงจ้างทีมช่างรายโครงการ, เงื่อนไขเงินมัดจำ (`prop`/`first`), `holdPct`, `retPct`
13. `claims` — ใบเบิกงวดงานช่างรับเหมา (คำนวณตามสูตร Waterfall 8 ขั้นตอน)
14. `cinvoices` — ใบแจ้งหนี้/วางบิลลูกค้า (Customer Invoices)
15. `handovers` — ใบส่งมอบงานลูกค้า (`F-06`) และรายการบานที่ส่งมอบในแต่ละงวด
16. `ncrs` — ใบแจ้งงานไม่เป็นไปตามข้อกำหนด (NCR) และการติดตามการแก้ไข
17. `issues` — ปัญหาและอุปสรรคหน้างานทั่วไป
18. `dailies` — รายงานประจำวันหน้างาน (Daily Site Progress & Weather/Manpower)
19. `timesheets` — บันทึกเวลาเข้า-ออกงานและแรงงานรายวันของทีมช่าง
20. `users` — ข้อมูลผู้ใช้งาน, การผูกกับ Central IAM (`external_id`, `use_ad_auth`, `is_active`, `status_origin`), สิทธิ์ Override (`grant`/`deny`), โครงการที่ได้รับมอบหมาย (`assignedProjects`)
21. `roles` — บทบาทมาตรฐาน 10 บทบาท และเมทริกซ์สิทธิ์ 37 รายการ
22. `settings` / `system_settings` — ข้อมูลบริษัท, งวดงานมาตรฐาน, และค่าคอนฟิก Central IAM v2.9.0 / AI Copilot (Zero `.env`)
23. `transaction_logs` — ตารางบันทึก Audit Trail ตามมาตรฐาน ISO/IEC 27001 และ CIAM v2.9.0

---

## 5. แบบฟอร์มเอกสารมาตรฐาน 19 รายการ (`F-00` ถึง `F-18`)

ทุกแบบฟอร์มต้องรองรับการแสดงตัวอย่างก่อนพิมพ์ (Print Preview) และการพิมพ์ขนาด A4 (ปี พ.ศ.):
- **`F-00`**: ใบสรุปราคาประมูลงานติดตั้ง (Bidding Summary Sheet)
- **`F-01`**: ใบตรวจสอบขนาดช่องปูนและระดับหน้างาน (Site Survey & Opening Check Form)
- **`F-02`**: ใบตรวจรับสินค้าและวัสดุเข้าหน้างาน (Material Delivery Inspection Form)
- **`F-03`**: ใบตรวจสอบคุณภาพงานติดตั้งภายใน (Internal QC Inspection Sheet)
- **`F-04`**: ใบแจ้งงานไม่เป็นไปตามข้อกำหนด (NCR — Non-Conformance Report)
- **`F-05`**: ใบสรุปการแก้ไขงาน Defect / Rework (Rework & Defect Clearance Form)
- **`F-06`**: ใบส่งมอบและตรวจรับงานติดตั้งลูกค้า (Customer Handover & Acceptance Certificate)
- **`F-07`**: สมุดพกตรวจคุณภาพรายบาน (Per-Opening QC Checklist Card)
- **`F-08`**: ใบตกลงจ้างเหมาแรงงานติดตั้ง (Subcontractor Engagement Agreement)
- **`F-09`**: หนังสือแจ้งรายชื่อทีมช่างเข้าปฏิบัติงานในพื้นที่ (Site Entry Notification Letter)
- **`F-10`**: ใบประเมินราคาจ้างเหมาทีมช่าง (Subcontractor Cost Estimation Sheet)
- **`F-11`**: ใบสรุปงบประมาณต้นทุนโครงการ (Project Cost Sheet / Budget Baseline)
- **`F-12`**: ใบเบิกงวดงานผู้รับเหมาช่วง (Subcontractor Progress Claim Voucher — 8-Step Waterfall)
- **`F-13`**: ใบแจ้งหนี้ / ใบวางบิลค่าบริการติดตั้งลูกค้า (Customer Progress Invoice)
- **`F-14`**: รายงานความสำเร็จตามสัญญาทางบัญชี (POC — Percentage of Completion Report)
- **`F-15`**: รายงานประมาณการกระแสเงินสดโครงการ (Project Cashflow Statement)
- **`F-16`**: ใบลงเวลาปฏิบัติงานประจำวันของทีมช่าง (Daily Manpower & Timesheet Form)
- **`F-17`**: หนังสือรับรองการคืนเงินประกันผลงาน (Retention Money Release Certificate — ล็อกวันที่ตาม `allAccDate`)
- **`F-18`**: รายงานสรุปสิทธิ์การเข้าถึงระบบของผู้ใช้งาน (User Access & RBAC Audit Report — ISO 27001 A.5.18)

---

## 6. ระบบควบคุมสิทธิ์ RBAC (10 Roles × 37 Permissions)

### 10 บทบาทมาตรฐาน (Default Roles):
1. `admin` — ผู้ดูแลระบบสูงสุด (System Administrator)
2. `exec` — ผู้บริหารระดับสูง (Executive / CFO / MD)
3. `pm` — ผู้จัดการโครงการ (Project Manager)
4. `qc` — วิศวกรตรวจสอบคุณภาพ (QC Inspector)
5. `foreman` — โฟร์แมนควบคุมหน้างาน (Site Foreman)
6. `sales` — ฝ่ายขายและประเมินราคา (Sales & Estimation)
7. `acct` — ฝ่ายบัญชีและการเงิน (Accounting & Finance)
8. `contractor` — ผู้รับเหมาช่วง / หัวหน้าทีมช่าง (External Subcontractor)
9. `customer` — ลูกค้า / เจ้าของโครงการ (External Customer Representative)
10. `viewer` — ผู้เข้าชมข้อมูลอย่างเดียว (Read-Only Auditor / Viewer)

### 7 กลุ่มสิทธิ์ (รวม 37 Permissions):
- **Group 1: โครงการและประมูลงาน (`proj.*`, `bid.*`)** — `proj.view`, `proj.create`, `proj.edit`, `proj.delete`, `proj.setup`, `proj.close`, `bid.view`, `bid.manage`, `bid.convert`
- **Group 2: งานติดตั้งและช่องเปิด (`inst.*`, `open.*`)** — `open.view`, `open.manage`, `inst.update`, `inst.holdpoint`, `inst.daily`, `inst.timesheet`
- **Group 3: คุณภาพและ NCR (`qc.*`, `ncr.*`)** — `qc.inspect`, `qc.accept`, `ncr.view`, `ncr.create`, `ncr.resolve`, `ncr.close`
- **Group 4: ส่งมอบงานลูกค้า (`handover.*`)** — `handover.view`, `handover.create`, `handover.approve`
- **Group 5: ทีมช่างและสัญญาจ้าง (`team.*`, `eng.*`)** — `team.view`, `team.manage`, `eng.view`, `eng.manage`, `master.manage`
- **Group 6: การเงิน เบิกงวด และรายงาน (`claim.*`, `inv.*`, `fin.*`, `rep.*`)** — `claim.view`, `claim.create`, `claim.approve`, `inv.manage`, `fin.view_cost`, `rep.poc_cashflow`
- **Group 7: ผู้ดูแลระบบและความปลอดภัย (`admin.*`)** — `admin.users`, `admin.settings`

> **กฎ `EXT_DENY` (17 สิทธิ์ที่ห้าม 부여ให้ผู้ใช้ภายนอก `contractor` / `customer` เด็ดขาด):**
> ผู้ใช้ภายนอกถูกตัดสิทธิ์การเห็นต้นทุนภายใน (`fin.view_cost`), การอนุมัติงวดงาน (`claim.approve`), การจัดการสัญญา/งบประมาณ (`proj.create`, `proj.edit`, `proj.delete`, `proj.setup`, `proj.close`, `bid.*`, `eng.manage`, `master.manage`, `inv.manage`, `rep.poc_cashflow`) และการตั้งค่าระบบ (`admin.users`, `admin.settings`) เสมอ
