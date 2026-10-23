"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { verifyProduct, verifyLineQuantity, describeEvidence } = require("../src/verifier");
const { normalizeProduct } = require("../src/catalogProvider");
const { product } = require("./helpers");

const ctx = { categoryQuantity: 1, maxDeliveryDays: 7, constraints: { minRefreshRateHz: 144 } };
const norm = (raw) => {
  const { product: p, error } = normalizeProduct(raw, "SYNTHETIC_DEMO");
  assert.equal(error, undefined);
  return p;
};
const check = (v, id) => v.checks.find((c) => c.checkId === id);

test("a 165 Hz monitor delivered in 3 days passes every mandatory check", () => {
  const v = verifyProduct(norm(product("M1", "monitor", { specs: { refreshRateHz: 165 }, deliveryDays: 3 })), ctx);
  assert.equal(v.eligible, true);
  assert.ok(v.checks.every((c) => c.status === "PASS"));
});

test("(2) a 75 Hz monitor fails with a specific reason", () => {
  const v = verifyProduct(norm(product("M75", "monitor", { specs: { refreshRateHz: 75 } })), ctx);
  assert.equal(v.eligible, false);
  assert.equal(check(v, "constraint.minRefreshRateHz").status, "FAIL");
  assert.equal(v.rejectionType, "FAILED_HARD_CONSTRAINT");
  assert.match(v.rejectedReason, /75 Hz; at least 144 Hz is required/);
});

test("(3) an unknown refresh rate is UNKNOWN, never a pass", () => {
  for (const specs of [{}, { refreshRateHz: null }, { refreshRateHz: "" }, { refreshRateHz: "fast" }]) {
    const v = verifyProduct(norm(product("M?", "monitor", { specs })), ctx);
    assert.equal(v.eligible, false, JSON.stringify(specs));
    assert.equal(check(v, "constraint.minRefreshRateHz").status, "UNKNOWN");
    assert.equal(v.rejectionType, "UNVERIFIABLE_MANDATORY_DATA");
    assert.match(v.rejectedReason, /could not be verified|cannot verify/i);
  }
});

test("(5) delivery beyond the limit fails; exactly at the limit passes", () => {
  const late = verifyProduct(norm(product("L", "mouse", { deliveryDays: 10 })), { ...ctx, constraints: {} });
  assert.equal(check(late, "delivery.withinLimit").status, "FAIL");
  assert.match(late.rejectedReason, /10 days; the maximum allowed is 7 days/);
  const onTime = verifyProduct(norm(product("T", "mouse", { deliveryDays: 7 })), { ...ctx, constraints: {} });
  assert.equal(onTime.eligible, true);
});

test("(6) unknown delivery is UNKNOWN and makes the product ineligible", () => {
  const v = verifyProduct(norm(product("D?", "mouse", { deliveryDays: null })), { ...ctx, constraints: {} });
  assert.equal(check(v, "delivery.withinLimit").status, "UNKNOWN");
  assert.equal(v.eligible, false);
});

test("unknown shipping is not assumed to be zero", () => {
  const v = verifyProduct(norm(product("S?", "mouse", { shippingINR: null })), { ...ctx, constraints: {} });
  assert.equal(check(v, "shipping.known").status, "UNKNOWN");
  assert.equal(v.eligible, false);
  assert.match(v.rejectedReason, /not assumed to be zero/);
});

test("(7) stock: out of stock fails, unknown stock is UNKNOWN, over-quantity lines fail", () => {
  const out = verifyProduct(norm(product("O", "mouse", { stockQuantity: 0 })), { ...ctx, constraints: {} });
  assert.equal(check(out, "stock.available").status, "FAIL");
  const unk = verifyProduct(norm(product("U", "mouse", { stockQuantity: null })), { ...ctx, constraints: {} });
  assert.equal(check(unk, "stock.available").status, "UNKNOWN");

  const two = norm(product("TWO", "mouse", { stockQuantity: 2 }));
  assert.equal(verifyLineQuantity(two, 2).status, "PASS");
  const over = verifyLineQuantity(two, 3);
  assert.equal(over.status, "FAIL");
  assert.match(over.detail, /exceeds available stock of 2/);
  // low stock is a warning at product level, not a rejection: it may still cover part of a mixed basket
  const partial = verifyProduct(two, { ...ctx, categoryQuantity: 3, constraints: {} });
  assert.equal(partial.eligible, true);
  assert.match(partial.warnings.join(" "), /at most 2 of the 3/);
});

test("price is never a per-product rejection reason", () => {
  const v = verifyProduct(norm(product("EXP", "mouse", { unitPriceINR: 999999 })), { ...ctx, constraints: {} });
  assert.equal(v.eligible, true);
});

test("missing soft data only produces warnings", () => {
  const v = verifyProduct(norm(product("SOFT", "mouse", { qualityScore: null, warrantyMonths: null })), { ...ctx, constraints: {} });
  assert.equal(v.eligible, true);
  assert.ok(v.warnings.some((w) => /Quality score unknown/.test(w)));
  assert.ok(v.warnings.some((w) => /Warranty not confirmed/.test(w)));
});

test("other registry constraints: in / notIn / equals / max", () => {
  const hp = norm(product("HP", "headphones", { brand: "Acme", specs: { anc: false, connectivity: "Wired" } }));
  const r = verifyProduct(hp, {
    ...ctx,
    constraints: { requireAnc: true, connectivityIn: ["wired"], excludedBrands: ["acme"], maxUnitPriceINR: 2000 },
  });
  assert.equal(check(r, "constraint.requireAnc").status, "FAIL");
  assert.equal(check(r, "constraint.connectivityIn").status, "PASS"); // case-insensitive
  assert.equal(check(r, "constraint.excludedBrands").status, "FAIL");
  assert.equal(check(r, "constraint.maxUnitPriceINR").status, "PASS");
});

test("(17) evidence: demo data is never VERIFIED; only a fresh, found source is", () => {
  const now = new Date("2026-10-23T12:00:00Z");
  assert.equal(describeEvidence(norm(product("X", "mouse")), now).status, "UNVERIFIED_DEMO_DATA");

  const real = (lastCheckedISO, sourceLookup = "FOUND") =>
    norm(product("R", "mouse", { sourceUrl: "https://shop.test/p/r", lastCheckedISO, provenance: { dataOrigin: "SOURCE_VERIFIED", sourceLookup } }));
  assert.equal(describeEvidence(real("2026-10-23T08:00:00Z"), now).status, "VERIFIED");
  assert.equal(describeEvidence(real("2026-10-20T08:00:00Z"), now).status, "SOURCE_STALE");
  const notFound = describeEvidence(real("2026-10-23T08:00:00Z", "NOT_FOUND"), now);
  assert.equal(notFound.status, "UNVERIFIED");
  assert.match(notFound.warnings.join(" "), /did not find/);
  const unavailable = describeEvidence(real("2026-10-23T08:00:00Z", "UNAVAILABLE"), now);
  assert.match(unavailable.warnings.join(" "), /unavailable/);
});

test("(17) catalog loader refuses example.* links as evidence", () => {
  const { error } = normalizeProduct(product("E", "mouse", { sourceUrl: "https://www.example.com/item" }), "SYNTHETIC_DEMO");
  assert.match(error, /placeholder example/);
});
