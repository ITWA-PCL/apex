---
name: wa-install-ui-pwa
description: Enforces UX/UI design fidelity, theme tokens, responsive mobile PWA behavior, and printable Thai A4 forms (F-00 to F-18) based on Docs/install-tracker_26.html for APEX (apex.windowasia.com). Activate whenever building or styling frontend pages, components, modals, or print forms.
---

# APEX UI/UX & Printable Forms Skill (`wa-install-ui-pwa`)

Use this skill whenever building or modifying Frontend UI, PWA views, or printable forms (`F-00`–`F-18`) for **APEX (`apex.windowasia.com`)**.

Reference mockup: `Docs/install-tracker_26.html`

## 1. Visual Design System (From `install-tracker_26.html`)
- **Typography:**
  - Primary Thai/English UI font: `'Sarabun', sans-serif` (weights 300, 400, 500, 600, 700)
  - Monospace font for codes, opening IDs, document numbers, and financial figures: `'JetBrains Mono', monospace`
- **Color Palette & Status Badges:**
  - Brand Primary (Navy/Blue): `#0f172a` (Sidebar/Header dark), `#1e40af` / `#2563eb` (Primary actions)
  - Stage & Opening Status Colors:
    - `pending` (รอดำเนินการ): Slate/Gray (`#64748b`, bg `#f1f5f9`)
    - `doing` (กำลังทำ): Blue/Amber (`#2563eb` / `#d97706`)
    - `done` (ติดตั้งเสร็จ รอ QC): Cyan/Indigo (`#0284c7`)
    - `accepted` (ตรวจรับผ่าน ◆): Emerald Green (`#16a34a`, bg `#dcfce7`)
    - `defect` / `ncr` (พบปัญหา/NCR): Crimson Red (`#dc2626`, bg `#fee2e2`)
    - Hold Point symbol (`◆`): Amber/Gold badge highlighting mandatory inspection gates (`S2`, `S3`, `S6`, `S7`, `S8`).

## 2. Desktop & Mobile Field PWA Requirements
- **Desktop View:** Full 10-menu collapsible sidebar, multi-column KPI cards, Opening Matrix grid with quick filters (Building, Floor, Unit, Team, Status), and side-by-side financial tables.
- **Mobile PWA View (Foreman, QC, Subcontractor on-site):**
  - Touch-friendly bottom navigation / drawer (`min-height: 44px` tap targets).
  - Camera capture support (`<input type="file" accept="image/*" capture="environment">`) with client-side image compression before upload.
  - HTML5 Canvas touch signature pad for Customer Handover (`F-06`) and QC Inspection (`F-01`–`F-03`, `F-07`).

## 3. Printable Official Forms (`F-00` to `F-18`)
- Every form `F-00` through `F-18` must have a dedicated A4 Print Preview component matching the layout in `Docs/install-tracker_26.html`.
- **Buddhist Era Date Formatting:** All dates on printed forms (`F-00`–`F-18`) MUST display in Thai Buddhist Era (`พ.ศ. = ค.ศ. + 543`).
- Include company header (**บริษัท วินโดว์ เอเชีย จำกัด (มหาชน)**), document control code (`F-XX`), revision box, and signature blocks at the bottom of each form.
