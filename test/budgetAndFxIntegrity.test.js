"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createSignedMandate, enforceMandate } = require("../src/mandateService");
const { convertInrToUsd, getFxRate } = require("../src/paypalService");

test("Phase 1 Integrity: Request 'under ₹60,000' yields exact 60,000 cap in plans, mandate, and settlement", () => {
  const userRequestText = "I need a complete setup for coding and gaming under ₹60,000. I already own a laptop.";
  
  // Extract budget amount using canonical regex/parser logic
  const budgetMatch = userRequestText.match(/[₹RsINR\s]*([0-9,]+)/i);
  assert.ok(budgetMatch && budgetMatch[1], "Budget should be parsed from prompt");
  const parsedCap = parseInt(budgetMatch[1].replace(/,/g, ""), 10);
  assert.equal(parsedCap, 60000, "Parsed cap must strictly equal 60000");

  // Create mandate using parsed budget cap
  const inrPerUsd = 94.93;
  const planTotalINR = 35492;
  const expectedUSD = Number((planTotalINR / inrPerUsd).toFixed(2)); // 373.88

  const mandate = createSignedMandate({
    planId: "plan_demo_1",
    planVersion: 1,
    maxTotalINR: parsedCap,
    maxTotalUSD: Number((parsedCap / inrPerUsd).toFixed(2)),
    fxRate: 1 / inrPerUsd,
    items: [
      { productId: "MON-001", name: "LG UltraGear", quantity: 1, unitPriceINR: 12499 },
      { productId: "KEY-002", name: "Keychron V1", quantity: 1, unitPriceINR: 7999 },
      { productId: "MOU-002", name: "Razer Viper V3", quantity: 1, unitPriceINR: 5995 },
      { productId: "HDP-003", name: "Audio-Technica ATH-M40x", quantity: 1, unitPriceINR: 8999 },
    ],
  });

  assert.equal(mandate.maxTotalINR, 60000, "Mandate maxTotalINR must match 60,000 budget cap");
  assert.ok(mandate.signature.length >= 64, "Mandate must be cryptographically signed");

  // Enforce mandate against plan total
  const enforcement = enforceMandate({
    mandateId: mandate.mandateId,
    totalINR: planTotalINR,
    totalUSD: expectedUSD,
    planVersion: 1,
  });
  assert.equal(enforcement.allowed, true, "Plan total 35,492 must pass under 60,000 cap");

  // Enforce against exceeding total
  const breachEnforcement = enforceMandate({
    mandateId: mandate.mandateId,
    totalINR: 65000,
    totalUSD: 700.0,
    planVersion: 1,
  });
  assert.equal(breachEnforcement.allowed, false, "Total 65,000 must fail closed when exceeding 60,000 cap");
  assert.equal(breachEnforcement.code, "CEILING_EXCEEDED");
});

test("Phase 1 Integrity: FX math consistency - usdTotal === round(inrTotal / fxRate, 2)", async () => {
  const inrPerUsd = 94.93;

  // Plan B: ₹35,492 -> 35492 / 94.93 = 373.875... -> 373.88 USD
  const inrPlanB = 35492;
  const calculatedUSD = convertInrToUsd(inrPlanB, inrPerUsd);
  const directUSD = Number((inrPlanB / inrPerUsd).toFixed(2));
  assert.equal(calculatedUSD, 373.88);
  assert.equal(directUSD, 373.88);
  assert.equal(calculatedUSD, directUSD);

  // Budget Cap: ₹60,000 -> 60000 / 94.93 = 632.044... -> 632.04 USD
  const inrCap = 60000;
  const capUSD = convertInrToUsd(inrCap, inrPerUsd);
  assert.equal(capUSD, 632.04);

  // Plan A: ₹24,996 -> 24996 / 94.93 = 263.31 USD
  const inrPlanA = 24996;
  const planAUSD = convertInrToUsd(inrPlanA, inrPerUsd);
  assert.equal(planAUSD, 263.31);

  // Plan C: ₹48,496 -> 48496 / 94.93 = 510.86 USD
  const inrPlanC = 48496;
  const planCUSD = convertInrToUsd(inrPlanC, inrPerUsd);
  assert.equal(planCUSD, 510.86);

  // Verify live endpoint consistency
  const fx = await getFxRate();
  const liveInrPerUsd = fx.inrPerUsd;
  assert.ok(liveInrPerUsd >= 70 && liveInrPerUsd <= 120, "Live INR per USD rate must be reasonable");
  const liveUSD = convertInrToUsd(inrPlanB, liveInrPerUsd);
  assert.equal(liveUSD, Number((inrPlanB / liveInrPerUsd).toFixed(2)));
});
