"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { buildPlan, summarizeSpecs } = require("../src/planService");
const { validateRequest } = require("../src/requestValidator");
const { createJsonFileCatalogProvider } = require("../src/catalogProvider");
const { unitsChanged, categoriesChanged } = require("../src/optimizer");
const { product, request, provider, productIds, extraction, condition } = require("./helpers");

const laptopRequest = require("../examples/request-5-laptops.json");
const demoCatalog = () => createJsonFileCatalogProvider(path.join(__dirname, "..", "src", "catalog.json"));
const laptop = (id, specs, overrides = {}) =>
  product(id, "laptop", { unitPriceINR: 50000, warrantyMonths: 12, specs: { ramGB: 16, storageGB: 512, storageType: "SSD", os: "Windows", weightKg: 1.5, screenInches: 14, ...specs }, ...overrides });
const laptopBody = (overrides = {}) =>
  request({ requiredCategories: [{ category: "laptop", quantity: 5 }], hardConstraints: { laptop: { minRamGB: 16 } }, budgetINR: 300000, maxDeliveryDays: 10, ...overrides });
const units = (s) => s.items.reduce((n, i) => n + i.quantity, 0);

test("laptop constraints are accepted by the request validator; typos are still rejected", () => {
  const ok = validateRequest(laptopRequest);
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.value.hardConstraints, { laptop: { minRamGB: 16, minWarrantyMonths: 12 } });
  const all = validateRequest(laptopBody({
    hardConstraints: { laptop: { minRamGB: 16, minStorageGB: 512, storageTypeIn: ["SSD"], osIn: ["Windows"], maxWeightKg: 2, minScreenInches: 13, maxScreenInches: 16 } },
  }));
  assert.equal(all.ok, true);
  const typo = validateRequest(laptopBody({ hardConstraints: { laptop: { minRam: 16 } } }));
  assert.equal(typo.ok, false);
  assert.ok(typo.errors.some((e) => e.field === "hardConstraints.laptop.minRam"));
});

test("demo: 5 laptops, >=16 GB RAM, >=12-month warranty, <= ₹3 lakh, <= 10 days", async () => {
  const p = await buildPlan(laptopRequest, demoCatalog());
  assert.equal(p.status, "DRAFT");
  assert.deepEqual(Object.keys(p.strategies), ["CHEAPEST", "BEST_VALUE", "ALTERNATIVE"]);
  for (const s of Object.values(p.strategies)) {
    assert.equal(units(s), 5);
    assert.ok(s.totalINR <= 300000);
    assert.ok(Object.values(s.constraintSummary).every((c) => c === "PASSED"));
    for (const i of s.items) {
      assert.ok(i.specs.ramGB >= 16, i.productId);
      assert.ok(i.warrantyMonths >= 12, i.productId);
      assert.ok(i.deliveryDays <= 10, i.productId);
      assert.match(i.specsSummary, /GB RAM/);
    }
    // low-stock notes stay on the item, not on the plan
    assert.ok(!s.warnings.some((w) => /in stock/.test(w)));
  }
  assert.equal(p.strategies.CHEAPEST.totalINR, 250494);
  assert.equal(p.strategies.BEST_VALUE.totalINR, 281249);
  // stock forces a mixed-SKU best basket: LAP-001 has only 3 units
  assert.deepEqual(productIds(p.strategies.BEST_VALUE), ["LAP-001x3", "LAP-011x2"]);

  const rejected = Object.fromEntries(p.rejectedProducts.map((r) => [r.productId, r.rejectedReason]));
  assert.match(rejected["LAP-005"], /RAM is 8 GB; at least 16 GB/);
  assert.match(rejected["LAP-006"], /RAM is not listed/);
  assert.match(rejected["LAP-007"], /14 days; the maximum allowed is 10/);
  assert.match(rejected["LAP-008"], /Out of stock/);
  assert.match(rejected["LAP-009"], /warranty is 6 months; at least 12/);
  assert.match(rejected["LAP-010"], /warranty is not listed/);
  assert.equal(p.rejectedProducts.length, 6);
});

test("without a warranty requirement, warranty gaps are only warnings and price is never a rejection reason", async () => {
  const body = { ...laptopRequest, hardConstraints: { laptop: { minRamGB: 16 } } };
  const p = await buildPlan(body, demoCatalog());
  const rejectedIds = p.rejectedProducts.map((r) => r.productId).sort();
  assert.deepEqual(rejectedIds, ["LAP-005", "LAP-006", "LAP-007", "LAP-008"]);
});

test("ALTERNATIVE is materially different: a different product for at least half of all units", async () => {
  const p = await buildPlan(laptopRequest, demoCatalog());
  const alt = p.strategies.ALTERNATIVE;
  assert.ok(alt.tradeOff.unitsChanged >= 3);
  assert.match(alt.tradeOff.summary, /different product for \d of 5 unit/);
  assert.ok(alt.totalINR < p.strategies.BEST_VALUE.totalINR);
});

test("a one-unit swap is not offered as an ALTERNATIVE", async () => {
  // Best basket: 4x A (stock 4) + 1x B. The only other baskets swap one unit or are worse.
  const catalog = [
    laptop("LAP-A", {}, { stockQuantity: 4, qualityScore: 0.9, reliabilityScore: 0.9 }),
    laptop("LAP-B", {}, { stockQuantity: 1, qualityScore: 0.6, reliabilityScore: 0.6, unitPriceINR: 49000 }),
  ];
  const p = await buildPlan(laptopBody(), provider(catalog));
  assert.deepEqual(productIds(p.strategies.BEST_VALUE), ["LAP-Ax4", "LAP-Bx1"]);
  assert.ok(!p.strategies.ALTERNATIVE);
  assert.match(p.omittedStrategies.find((o) => o.strategyKey === "ALTERNATIVE").reason, /3 of 5 unit/);
});

test("unitsChanged / categoriesChanged count real differences", async () => {
  const p = await buildPlan(laptopRequest, demoCatalog());
  const toBasket = (s) => ({
    selections: [{ category: "laptop", quantity: 5, option: { key: productIds(s).join("+"), lines: s.items.map((i) => ({ cand: { product: { productId: i.productId } }, quantity: i.quantity })) } }],
  });
  const best = toBasket(p.strategies.BEST_VALUE);
  const cheap = toBasket(p.strategies.CHEAPEST);
  assert.equal(unitsChanged(best, best), 0);
  assert.equal(unitsChanged(best, cheap), 5);
  assert.deepEqual(categoriesChanged(best, cheap), ["laptop"]);
});

test("mixed laptops + accessories in one basket", async () => {
  const body = {
    ...laptopRequest,
    budgetINR: 340000,
    requiredCategories: [{ category: "laptop", quantity: 5 }, { category: "mouse", quantity: 5 }],
    hardConstraints: { laptop: { minRamGB: 16, osIn: ["windows"] }, mouse: { connectivityIn: ["wireless"] } },
  };
  const p = await buildPlan(body, demoCatalog());
  assert.equal(p.status, "DRAFT");
  const bv = p.strategies.BEST_VALUE;
  assert.equal(bv.items.filter((i) => i.category === "laptop").reduce((n, i) => n + i.quantity, 0), 5);
  assert.equal(bv.items.filter((i) => i.category === "mouse").reduce((n, i) => n + i.quantity, 0), 5);
  assert.ok(bv.items.filter((i) => i.category === "mouse").every((i) => i.specs.connectivity === "wireless"));
  assert.ok(bv.totalINR <= 340000);
});

test("laptop specs display", () => {
  assert.equal(
    summarizeSpecs({ ramGB: 32, storageGB: 1024, storageType: "SSD", os: "Windows", weightKg: 2.1, screenInches: 16 }),
    '32 GB RAM · 1 TB · SSD · Windows · 2.1 kg · 16"'
  );
});

test("3 lakh with RAM >= 32 GB is infeasible with a precise explanation", async () => {
  const body = { ...laptopRequest, hardConstraints: { laptop: { minRamGB: 32 } } };
  const p = await buildPlan(body, demoCatalog());
  assert.equal(p.status, "INFEASIBLE");
  // eligible 32 GB laptops: LAP-004 (4 in stock) + LAP-012 (3) — 5 units cost far above ₹3 lakh
  assert.ok(p.infeasibility.cheapestPossibleTotalINR > 300000);
  assert.match(p.infeasibility.reasons.join(" "), /exceeds the ₹3,00,000 budget/);
});

// ---- AI handoff (injected model output; no live Gemini call) -----------------
const { createAIService } = require("../src/aiService");
const { createPlanStore } = require("../src/planStore");
const { SYSTEM_INSTRUCTION, schemaErrors } = require("../src/requestExtraction");

function aiWith(draft) {
  return createAIService({ extract: async () => structuredClone(draft), catalogProvider: demoCatalog(), planStore: createPlanStore() });
}
const laptopDraft = (overrides = {}) => extraction({
  budget: { amount: 300000 }, delivery: { maxDays: 10 },
  items: [{ category: "laptop", quantity: 5, unit: "unit", required: true, constraints: [
    condition("ramGB", "gte", 16, "at least 16 GB RAM", "GB"),
    condition("warrantyMonths", "gte", 12, "minimum one-year warranty", "months"),
  ] }],
  weights: null, ...overrides,
});

test("AI agent: laptop and GPU requirements use the general extraction schema", () => {
  assert.deepEqual(schemaErrors(laptopDraft()), []);
  const gpu = laptopDraft();
  gpu.items[0].constraints.push(condition("gpu", "eq", "RTX 4060", "RTX 4060"));
  assert.deepEqual(schemaErrors(gpu), []);
  gpu.items[0].constraints.at(-1).operator = "invalid";
  assert.ok(schemaErrors(gpu).length > 0);
  assert.ok(!SYSTEM_INSTRUCTION.includes("Laptop/RAM support is currently unavailable"));
  assert.match(SYSTEM_INSTRUCTION, /ramGB/);
});

test("AI agent: '5 laptops, 16 GB, 1-year warranty, 3 lakh' goes straight to a plan", async () => {
  const result = await aiWith(laptopDraft()).plan({ messages: [laptopRequest.rawQuery] });
  assert.equal(result.status, "PLANNED");
  assert.deepEqual(result.unsupportedRequirements, []);
  assert.equal(result.plan.strategies.CHEAPEST.totalINR, 250494);
  assert.equal(result.plan.strategies.BEST_VALUE.totalINR, 281249);
  assert.equal(result.recommendation.strategyKey, "BEST_VALUE");
});

test("AI agent: GPU requirements parse READY while the legacy planning bridge reports its limitation", async () => {
  const api = aiWith(laptopDraft({
    budget: { amount: 200000 },
    items: [{ category: "laptop", quantity: 2, unit: "unit", required: true, constraints: [
      condition("ramGB", "gte", 16, "16 GB RAM", "GB"),
      condition("gpu", "eq", "RTX 4060", "RTX 4060"),
    ] }],
  }));
  const body = { messages: ["2 laptops with RTX 4060 and 16 GB RAM, INR 2 lakh total, 10 days"] };
  const parsed = await api.parse(body);
  assert.equal(parsed.status, "READY");
  assert.equal(parsed.request.items[0].constraints[1].value, "RTX 4060");
  const result = await api.plan(body);
  assert.equal(result.status, "ENGINE_SUPPORT_REQUIRED");
  assert.equal(result.plan, null);
  assert.match(result.unsupportedRequirements.join(" "), /RTX 4060/);
});
