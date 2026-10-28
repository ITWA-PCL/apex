---
name: wa-construction-finance
description: Enforces Window Asia's construction accounting, 8-step subcontractor claim waterfall, delivery VAT exemption, POC (Percentage of Completion), Cashflow, and F-17 retention release rules for APEX (apex.windowasia.com). Activate whenever writing or modifying bidding, budget, claims, invoices, POC, cashflow, or project closure logic.
---

# Window Asia Construction Finance & Process Gate Skill (`wa-construction-finance`)

Use this skill whenever implementing or modifying financial calculations, bidding, subcontractor claims (`F-12`), customer invoices (`F-13`), POC (`F-14`), Cashflow (`F-15`), Retention Release (`F-17`), or Project Closure (`S8`) in **APEX (`apex.windowasia.com`)**.

Reference documents:
- `Docs/install-tracker_26.html`
- `Docs/สรุประบบควบคุมงานติดตั้ง_สำหรับทำอินโฟกร.md`
- `Docs/สรุประบบควบคุมงานติดตั้ง_สำหรับผู้บริหาร_.md`

## 1. Precision Arithmetic Rule
- Always use `Decimal` (in Python `decimal.Decimal` with `ROUND_HALF_UP` to 2 decimal places) for all currency, tax, and percentage calculations. Never use floating-point arithmetic for persisted financial records.

## 2. Delivery Fee VAT Exemption Rule
- **Delivery fees (`delivery`) NEVER carry 7% VAT.**
- When calculating Bidding (`bids`), Sales Orders (`sales`), or Customer Invoices (`cinvoices`), apply 7% VAT only to Material/Product and Installation Service lines, and add `delivery` after VAT (exempt).

## 3. 8-Step Subcontractor Progress Claim Waterfall (`F-12`)
Given an engagement contract (`engagements`) and completed opening sub-steps in period $t$:
1. **Gross Work Value (`workValue`):** Sum of (completed opening sub-step weight % × agreed unit labor rate).
2. **Deposit Recoupment (`depDeduct`):**
   - If `depMethod == 'prop'`: $\min(\text{remainingDeposit}, \text{workValue} \times \frac{\text{initialDeposit}}{\text{contractTotal}})$
   - If `depMethod == 'first'`: $\min(\text{remainingDeposit}, \text{workValue})$
3. **Acceptance Holdback (`holdbackDeduct`):** $\text{workValue} \times \frac{\text{holdPct}}{100}$ (if final customer acceptance is pending).
4. **Taxable Billing Base (`taxBase`):** $\max(0, \text{workValue} - \text{depDeduct} - \text{holdbackDeduct})$
5. **VAT (`vatAmount`):** If team is VAT-registered (`team.vat == true`), $\text{taxBase} \times 0.07$, else $0$.
6. **Withholding Tax (`whtAmount`):** $\text{taxBase} \times \frac{\text{team.whtRate}}{100}$ *(calculated on `taxBase` before VAT)*.
7. **Performance Retention (`retentionDeduct`):** $\text{workValue} \times \frac{\text{retPct}}{100}$ *(calculated on full `workValue` from Step 1, NOT `taxBase`)*.
8. **Net Payable (`netPay`):** $\text{taxBase} + \text{vatAmount} - \text{whtAmount} - \text{retentionDeduct}$.

## 4. Retention Release Certificate Date Lock (`F-17`)
- Calculate `allAccDate(project, team)` = the maximum (latest) `acceptedDate` across ALL openings assigned to `team` in `project`.
- If any opening assigned to `team` is not yet `accepted`, `allAccDate` is `null` and **`F-17` CANNOT be issued**.
- The warranty start date on `F-17` is strictly locked to `allAccDate(project, team)` and the warranty expiration date is `allAccDate + warrantyMonths`.

## 5. Project Closure Gate (`S8`)
- A project cannot transition to `S8` (Closed) unless all **7 Auto-Checks** pass (100% openings accepted, 0 open NCRs, 0 open site issues, all handovers approved, all subcontractor claims settled, all customer invoices issued, retention records complete) AND all **6 Mandatory Closeout Documents** are uploaded/verified.
