"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const { createJsonFileCatalogProvider } = require("../src/catalogProvider");
const { buildPlan } = require("../src/planService");

const catalogPath = path.join(__dirname, "..", "src", "catalog.json");
const sample = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "examples", "request-60k-setup.json"), "utf8"));

test("demo catalog loads cleanly and is honestly labelled", async () => {
  const provider = createJsonFileCatalogProvider(catalogPath);
  const { products, loadWarnings } = await provider.listProducts();
  assert.deepEqual(loadWarnings, []);
  assert.ok(products.length >= 30);
  for (const c of ["monitor", "keyboard", "mouse", "headphones"]) {
    assert.ok(products.filter((p) => p.category === c).length >= 8, c);
  }
  for (const p of products) {
    assert.equal(p.provenance.dataOrigin, "SYNTHETIC_DEMO", p.productId);
    assert.equal(p.sourceUrl, null, p.productId);
    assert.equal(p.lastCheckedISO, null, p.productId);
  }
  assert.equal(provider.describe().dataOrigin, "SYNTHETIC_DEMO");
});

test("demo: the sample request yields a complete plan within budget with explicit evidence", async () => {
  const p = await buildPlan(sample, createJsonFileCatalogProvider(catalogPath));
  assert.equal(p.status, "DRAFT");
  for (const s of Object.values(p.strategies)) {
    assert.ok(s.totalINR <= 60000);
    assert.equal(s.leftoverBudgetINR, 60000 - s.totalINR);
    assert.ok(s.items.find((i) => i.category === "monitor").specs.refreshRateHz >= 144);
    assert.equal(s.items.length, 4);
    for (const i of s.items) {
      // price, shipping, stock, delivery (+ refresh rate for the monitor)
      assert.equal(i.verification.checksPassed.length, i.category === "monitor" ? 5 : 4, i.productId);
      assert.ok(i.verification.warnings.some((w) => /Synthetic demo record/.test(w)), i.productId);
    }
  }
  // the deliberately broken records are all rejected with a reason
  const rejected = Object.fromEntries(p.rejectedProducts.map((r) => [r.productId, r.rejectedReason]));
  assert.match(rejected["MON-004"], /75 Hz/);
  assert.match(rejected["MON-005"], /not listed/);
  assert.match(rejected["MON-007"], /10 days/);
  assert.match(rejected["MON-008"], /Out of stock/);
  assert.match(rejected["MON-010"], /Delivery estimate is unknown/);
  assert.match(rejected["KB-007"], /Shipping cost is unknown/);
  assert.match(rejected["KB-009"], /Stock availability is unknown/);
});

test("a missing or corrupt catalog file raises CatalogUnavailableError", async () => {
  await assert.rejects(createJsonFileCatalogProvider("/nonexistent/catalog.json").listProducts(), { name: "CatalogUnavailableError" });
});
