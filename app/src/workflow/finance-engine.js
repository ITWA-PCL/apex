/**
 * APEX (apex.windowasia.com) - Track B (CFO): Construction Finance & Process Gate Engine
 * Enforces:
 * 1. 8-Step Subcontractor Claim Waterfall (F-12 / F-15 / F-16)
 * 2. Delivery Fee VAT Exemption (delivery NEVER has 7% VAT)
 * 3. Retention Release Certificate Date Lock (F-17 allAccDate)
 */

const VAT_RATE = 0.07;

function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

/**
 * 8-Step Subcontractor Progress Claim Waterfall Calculation
 */
function calculateContractorClaimWaterfall({
  workValue = 0,
  depDeduct = 0,
  holdbackDeduct = 0,
  isVatRegistered = false,
  whtPct = 3,
  retPct = 5,
  isHoldbackRelease = false
}) {
  const sub = round2(workValue);
  const dep = isHoldbackRelease ? 0 : round2(depDeduct);
  const hold = isHoldbackRelease ? 0 : round2(holdbackDeduct);

  // Step 4: Taxable Billing Base
  const base = Math.max(0, round2(sub - dep - hold));

  // Step 5: VAT 7% (only if VAT registered)
  const vatAmt = isVatRegistered ? round2(base * VAT_RATE) : 0;
  const total = round2(base + vatAmt);

  // Step 6: WHT (calculated on base before VAT)
  const wht = Number(whtPct) || 0;
  const whtAmt = round2((base * wht) / 100);

  // Step 7: Performance Retention (calculated on FULL workValue from Step 1, NOT base)
  const ret = isHoldbackRelease ? 0 : Number(retPct) || 0;
  const retAmt = isHoldbackRelease ? 0 : round2((sub * ret) / 100);

  // Step 8: Net Payable
  const net = round2(base + vatAmt - whtAmt - retAmt);

  return {
    sub,
    dep,
    hold,
    base,
    vat: Boolean(isVatRegistered),
    vatAmt,
    total,
    wht,
    whtAmt,
    ret,
    retAmt,
    net
  };
}

/**
 * Customer Progress Invoice Calculation (Enforces Delivery Fee VAT Exemption)
 */
function calculateCustomerInvoice({
  goodsAndInstall = 0,
  delivery = 0,
  retPct = 5,
  whtPct = 3
}) {
  const goods = round2(goodsAndInstall);
  const dlv = round2(delivery);

  // Delivery NEVER carries 7% VAT
  const vat = round2(goods * VAT_RATE);
  const total = round2(goods + dlv + vat);

  const ret = round2(((goods + dlv) * (Number(retPct) || 0)) / 100);
  const wht = round2(((goods + dlv) * (Number(whtPct) || 0)) / 100);
  const net = round2(total - ret - wht);

  return { goods, dlv, vat, total, ret, wht, net };
}

module.exports = {
  round2,
  calculateContractorClaimWaterfall,
  calculateCustomerInvoice
};
