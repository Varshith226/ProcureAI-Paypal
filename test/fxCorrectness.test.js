"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { getFxRate, convertInrToUsd } = require("../src/paypalService");

test("Phase 12.1: FX conversion fixture - 60000 INR at 95.08 INR/USD ≈ 631 USD", () => {
  const inrAmount = 60000;
  const inrPerUsd = 95.08;
  const usdAmount = convertInrToUsd(inrAmount, inrPerUsd);

  // 60,000 / 95.08 = 631.0475389 -> 631.05 USD
  assert.equal(usdAmount, 631.05);
  assert.equal(Math.round(usdAmount), 631);
});

test("Phase 12.2: FX direction is explicitly stated and non-inverted", async () => {
  const fx = await getFxRate();

  assert.equal(fx.base, "USD");
  assert.equal(fx.target, "INR");
  assert.equal(fx.direction, "USD_TO_INR");
  assert.ok(typeof fx.inrPerUsd === "number");
  assert.ok(typeof fx.usdPerInr === "number");

  // In INR/USD, 1 USD is worth between 70 and 120 INR
  assert.ok(fx.inrPerUsd >= 70 && fx.inrPerUsd <= 120, `Expected inrPerUsd between 70 and 120, got ${fx.inrPerUsd}`);

  // In USD/INR, 1 INR is worth between 0.008 and 0.015 USD
  assert.ok(fx.usdPerInr >= 0.008 && fx.usdPerInr <= 0.015, `Expected usdPerInr between 0.008 and 0.015, got ${fx.usdPerInr}`);

  // Mathematical reciprocal consistency
  const product = fx.inrPerUsd * fx.usdPerInr;
  assert.ok(Math.abs(product - 1) < 0.01, `Expected inrPerUsd * usdPerInr ≈ 1, got ${product}`);

  // Formatted string includes INR per USD
  assert.ok(fx.displayRate.includes("INR per USD"));
  assert.ok(fx.source.length > 0);
  assert.ok(fx.timestamp.length > 0);
});

