"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { buildPlan } = require("../src/planService");
const { ValidationError } = require("../src/requestValidator");
const { product, request, provider, basicCatalog, productIds } = require("./helpers");

const plan = (body, products) => buildPlan(body, provider(products));
const sumBy = (arr, f) => arr.reduce((s, x) => s + f(x), 0);

test("(1)(9) one product per category -> DRAFT plan covering all four categories", async () => {
  const p = await plan(request(), basicCatalog());
  assert.equal(p.status, "DRAFT");
  const bv = p.strategies.BEST_VALUE;
  assert.deepEqual(bv.items.map((i) => i.category).sort(), ["headphones", "keyboard", "monitor", "mouse"]);
  assert.equal(bv.totalINR, 4000);
  assert.equal(bv.leftoverBudgetINR, 56000);
  assert.ok(Object.values(bv.constraintSummary).every((s) => s === "PASSED"));
});

test("(4)(12) a basket that cannot fit the budget is INFEASIBLE, with numbers and no fabricated plan", async () => {
  const p = await plan(request({ budgetINR: 3999 }), basicCatalog());
  assert.equal(p.status, "INFEASIBLE");
  assert.deepEqual(p.strategies, {});
  assert.equal(p.infeasibility.cheapestPossibleTotalINR, 4000);
  assert.match(p.infeasibility.reasons.join(" "), /costs ₹4,000, which exceeds the ₹3,999 budget by ₹1/);
  assert.ok(p.infeasibility.suggestions.some((s) => /Raise the budget/.test(s)));
});

test("(12) all monitors rejected -> INFEASIBLE with per-product evidence", async () => {
  const catalog = [
    product("MON-75", "monitor", { specs: { refreshRateHz: 75 } }),
    product("MON-UNK", "monitor", { specs: {} }),
    product("KB-A", "keyboard"),
    product("MS-A", "mouse"),
    product("HP-A", "headphones"),
  ];
  const p = await plan(request(), catalog);
  assert.equal(p.status, "INFEASIBLE");
  assert.match(p.infeasibility.reasons[0], /Monitor: none of the 2 catalog product\(s\) pass/);
  assert.deepEqual(p.rejectedProducts.map((r) => r.productId).sort(), ["MON-75", "MON-UNK"]);
  assert.equal(p.rejectedProducts.find((r) => r.productId === "MON-UNK").rejectionType, "UNVERIFIABLE_MANDATORY_DATA");
});

test("(12) a category missing from the catalog is reported, not skipped", async () => {
  const p = await plan(request({ requiredCategories: [{ category: "monitor", quantity: 1 }, { category: "webcam", quantity: 1 }] }), basicCatalog());
  assert.equal(p.status, "INFEASIBLE");
  assert.match(p.infeasibility.reasons.join(" "), /Webcam: the catalog has no products/);
});

test("(3) an unknown-refresh-rate monitor is excluded even when it would be cheapest and best", async () => {
  const catalog = basicCatalog([
    product("MON-0UNK", "monitor", { unitPriceINR: 1, qualityScore: 1, reliabilityScore: 1, specs: { refreshRateHz: null } }),
  ]);
  const p = await plan(request(), catalog);
  for (const s of Object.values(p.strategies)) assert.ok(!s.items.some((i) => i.productId === "MON-0UNK"));
  assert.ok(p.rejectedProducts.some((r) => r.productId === "MON-0UNK"));
});

test("(7) quantity above combined eligible stock is INFEASIBLE with a stock reason", async () => {
  const catalog = [product("MS-2", "mouse", { stockQuantity: 2 }), product("MS-0", "mouse", { stockQuantity: 0 })];
  const p = await plan(request({ requiredCategories: [{ category: "mouse", quantity: 3 }], hardConstraints: {} }), catalog);
  assert.equal(p.status, "INFEASIBLE");
  assert.match(p.infeasibility.reasons.join(" "), /3 unit\(s\) required but eligible products have only 2/);
  assert.match(p.rejectedProducts[0].rejectedReason, /Out of stock/);
});

test("(8)(10) mixed SKUs and multiple quantities: stock respected, shipping once per line, exact totals", async () => {
  // MS-HI is the better mouse but only 2 in stock; 3 mice are needed.
  const catalog = [
    product("MS-HI", "mouse", { unitPriceINR: 999.99, shippingINR: 49.5, stockQuantity: 2, qualityScore: 0.9, reliabilityScore: 0.9 }),
    product("MS-LO", "mouse", { unitPriceINR: 500, shippingINR: 40, stockQuantity: 5, qualityScore: 0.6, reliabilityScore: 0.6 }),
    product("KB-A", "keyboard", { unitPriceINR: 2500.25, shippingINR: 0 }),
  ];
  const body = request({
    requiredCategories: [{ category: "mouse", quantity: 3 }, { category: "keyboard", quantity: 2 }],
    hardConstraints: {},
    budgetINR: 10000,
  });
  const p = await plan(body, catalog);
  assert.equal(p.status, "DRAFT");
  const bv = p.strategies.BEST_VALUE;
  assert.deepEqual(productIds(bv), ["KB-Ax2", "MS-HIx2", "MS-LOx1"]);

  const hi = bv.items.find((i) => i.productId === "MS-HI");
  assert.equal(hi.lineTotalINR, 2049.48); // 999.99 * 2 + 49.50 (shipping NOT multiplied by quantity)
  const lo = bv.items.find((i) => i.productId === "MS-LO");
  assert.equal(lo.lineTotalINR, 540);
  const kb = bv.items.find((i) => i.productId === "KB-A");
  assert.equal(kb.lineTotalINR, 5000.5);

  assert.equal(bv.totalINR, 7589.98);
  assert.equal(bv.subtotalINR, 7500.48);
  assert.equal(bv.shippingTotalINR, 89.5);
  assert.equal(bv.leftoverBudgetINR, 2410.02);
  // independent reconciliation in paise
  const paise = (x) => Math.round(x * 100);
  assert.equal(sumBy(bv.items, (i) => paise(i.lineTotalINR)), paise(bv.totalINR));
  assert.equal(paise(bv.totalINR) + paise(bv.leftoverBudgetINR), paise(body.budgetINR));
  // coverage per category
  assert.equal(sumBy(bv.items.filter((i) => i.category === "mouse"), (i) => i.quantity), 3);
  assert.equal(sumBy(bv.items.filter((i) => i.category === "keyboard"), (i) => i.quantity), 2);
  // composite: mouse category = (2*0.9-ish + 1*0.6-ish)/3; exact value checked against the documented formula
  const unit = (q, r, d) => 0.45 * q + 0.35 * r + 0.2 * ((7 + 1 - d) / (7 + 1));
  const mouseScore = (2 * unit(0.9, 0.9, 2) + unit(0.6, 0.6, 2)) / 3;
  const kbScore = unit(0.5, 0.5, 2);
  assert.ok(Math.abs(bv.compositeScore - (mouseScore + kbScore) / 2) < 1e-4);
});

// ---------------------------------------------------------------------------
// Independent brute-force oracle over a small single-unit catalog.
// ---------------------------------------------------------------------------
const W = { quality: 0.45, reliability: 0.35, delivery: 0.2 };
const unitComposite = (p, D = 7) => W.quality * p.qualityScore + W.reliability * p.reliabilityScore + W.delivery * ((D + 1 - p.deliveryDays) / (D + 1));

function bruteForce(catalog, categories, budget) {
  const byCat = categories.map((c) => catalog.filter((p) => p.category === c));
  const baskets = [];
  (function rec(i, picked) {
    if (i === byCat.length) {
      const cost = sumBy(picked, (p) => p.unitPriceINR + p.shippingINR);
      if (cost <= budget) baskets.push({ ids: picked.map((p) => `${p.productId}x1`).sort(), cost, score: sumBy(picked, unitComposite) / picked.length });
      return;
    }
    for (const p of byCat[i]) rec(i + 1, [...picked, p]);
  })(0, []);
  return baskets;
}

const oracleCatalog = [
  product("MON-1", "monitor", { unitPriceINR: 20000, qualityScore: 0.95, reliabilityScore: 0.9, deliveryDays: 3 }),
  product("MON-2", "monitor", { unitPriceINR: 12000, qualityScore: 0.8, reliabilityScore: 0.85, deliveryDays: 2 }),
  product("MON-3", "monitor", { unitPriceINR: 8000, shippingINR: 300, qualityScore: 0.6, reliabilityScore: 0.6, deliveryDays: 6 }),
  product("KB-1", "keyboard", { unitPriceINR: 9000, qualityScore: 0.9, reliabilityScore: 0.9, deliveryDays: 4 }),
  product("KB-2", "keyboard", { unitPriceINR: 3000, qualityScore: 0.7, reliabilityScore: 0.75, deliveryDays: 1 }),
  product("KB-3", "keyboard", { unitPriceINR: 900, shippingINR: 99, qualityScore: 0.4, reliabilityScore: 0.6, deliveryDays: 2 }),
  product("MS-1", "mouse", { unitPriceINR: 6000, qualityScore: 0.92, reliabilityScore: 0.85, deliveryDays: 5 }),
  product("MS-2", "mouse", { unitPriceINR: 1800, qualityScore: 0.65, reliabilityScore: 0.7, deliveryDays: 3 }),
  product("HP-1", "headphones", { unitPriceINR: 25000, qualityScore: 0.98, reliabilityScore: 0.9, deliveryDays: 4 }),
  product("HP-2", "headphones", { unitPriceINR: 12000, qualityScore: 0.9, reliabilityScore: 0.85, deliveryDays: 4 }),
  product("HP-3", "headphones", { unitPriceINR: 1500, shippingINR: 99, qualityScore: 0.5, reliabilityScore: 0.6, deliveryDays: 2 }),
];
const CATS = ["monitor", "keyboard", "mouse", "headphones"];

test("(14) BEST_VALUE equals the brute-force maximum score; CHEAPEST equals the brute-force minimum cost", async () => {
  for (const budget of [60000, 45000, 30000, 20000, 12000]) {
    const all = bruteForce(oracleCatalog, CATS, budget);
    const p = await plan(request({ budgetINR: budget }), oracleCatalog);
    if (all.length === 0) {
      assert.equal(p.status, "INFEASIBLE", `budget ${budget}`);
      continue;
    }
    const maxScore = Math.max(...all.map((b) => b.score));
    const minCost = Math.min(...all.map((b) => b.cost));
    const bv = p.strategies.BEST_VALUE;
    assert.ok(Math.abs(bv.compositeScore - maxScore) < 1e-4, `budget ${budget}: ${bv.compositeScore} vs ${maxScore}`);
    // best value is the cheapest among the max-score baskets
    const bestCost = Math.min(...all.filter((b) => Math.abs(b.score - maxScore) < 1e-9).map((b) => b.cost));
    assert.equal(bv.totalINR, bestCost);
    const cheapestTotal = p.strategies.CHEAPEST ? p.strategies.CHEAPEST.totalINR : bv.totalINR;
    assert.equal(cheapestTotal, minCost, `budget ${budget}`);
    for (const s of Object.values(p.strategies)) assert.ok(s.totalINR <= budget);
  }
});

test("(14) greedy per-category picks would bust the budget; the optimizer finds the best complete basket", async () => {
  // Greedy: best unit score per category = MON-1 + KB-1 + MS-1 + HP-1 = ₹60,000 > ₹45,000.
  const p = await plan(request({ budgetINR: 45000 }), oracleCatalog);
  const bv = p.strategies.BEST_VALUE;
  assert.ok(bv.totalINR <= 45000);
  assert.notDeepEqual(productIds(bv), ["HP-1x1", "KB-1x1", "MON-1x1", "MS-1x1"]);
});

test("(15) ALTERNATIVE differs from BEST_VALUE in >= 2 categories, differs from CHEAPEST, and is cheaper or better evidenced", async () => {
  const p = await plan(request({ budgetINR: 60000 }), oracleCatalog);
  const { BEST_VALUE: bv, CHEAPEST: ch, ALTERNATIVE: alt } = p.strategies;
  assert.ok(alt, "an alternative exists in this catalog");
  const altIds = productIds(alt);
  assert.notDeepEqual(altIds, productIds(bv));
  if (ch) assert.notDeepEqual(altIds, productIds(ch));
  const bvIds = new Set(productIds(bv));
  assert.ok(altIds.filter((id) => !bvIds.has(id)).length >= 2);
  assert.ok(alt.totalINR < bv.totalINR);
  assert.ok(alt.tradeOff.categoriesChanged.length >= 2);
  assert.match(alt.tradeOff.summary, /less/);
});

test("(15) when only one feasible basket exists, CHEAPEST and ALTERNATIVE are omitted with reasons", async () => {
  const p = await plan(request(), basicCatalog());
  assert.deepEqual(Object.keys(p.strategies), ["BEST_VALUE"]);
  const omitted = Object.fromEntries(p.omittedStrategies.map((o) => [o.strategyKey, o.reason]));
  assert.match(omitted.CHEAPEST, /identical to the BEST_VALUE basket/);
  assert.match(omitted.ALTERNATIVE, /No other feasible basket/);
});

test("(13) ties are broken deterministically (lower product ID), regardless of catalog order", async () => {
  const twins = [product("MS-B", "mouse"), product("MS-A", "mouse"), product("KB-A", "keyboard")];
  const body = request({ requiredCategories: [{ category: "mouse", quantity: 1 }, { category: "keyboard", quantity: 1 }], hardConstraints: {} });
  const p1 = await plan(body, twins);
  const p2 = await plan(body, [...twins].reverse());
  assert.deepEqual(productIds(p1.strategies.BEST_VALUE), ["KB-Ax1", "MS-Ax1"]);
  assert.deepEqual(p1, p2); // the whole response is identical, planId included
});

test("(13) same score: the cheaper basket wins BEST_VALUE", async () => {
  const catalog = [product("MS-EXP", "mouse", { unitPriceINR: 2000 }), product("MS-CHEAP", "mouse", { unitPriceINR: 1500 })];
  const p = await plan(request({ requiredCategories: [{ category: "mouse", quantity: 1 }], hardConstraints: {} }), catalog);
  assert.deepEqual(productIds(p.strategies.BEST_VALUE), ["MS-CHEAPx1"]);
});

test("(17) no fabricated evidence or PayPal conversion in a demo plan", async () => {
  const p = await plan(request(), oracleCatalog);
  const json = JSON.stringify(p);
  assert.ok(!/example\.(com|org|net)/i.test(json));
  for (const s of Object.values(p.strategies)) {
    assert.equal(s.paypalSettlementUSD, null);
    assert.equal(s.verificationLevel, "UNVERIFIED_DEMO_DATA");
    for (const i of s.items) {
      assert.equal(i.verification.sourceUrl, null);
      assert.equal(i.verification.lastCheckedISO, null);
      assert.notEqual(i.verification.status, "VERIFIED");
      assert.equal(i.verification.sourceLookup, "NOT_CHECKED");
    }
    assert.ok(s.warnings.some((w) => /synthetic demo data/.test(w)));
  }
});

test("(11) invalid weights surface as a ValidationError from buildPlan", async () => {
  await assert.rejects(plan(request({ weights: { quality: 1, reliability: 1, delivery: 1 } }), basicCatalog()), ValidationError);
});

test("changing weights changes the BEST_VALUE pick in the documented direction", async () => {
  const catalog = [
    product("MS-FAST", "mouse", { qualityScore: 0.5, reliabilityScore: 0.5, deliveryDays: 0 }),
    product("MS-GOOD", "mouse", { qualityScore: 0.9, reliabilityScore: 0.9, deliveryDays: 7 }),
  ];
  const body = (weights) => request({ requiredCategories: [{ category: "mouse", quantity: 1 }], hardConstraints: {}, weights });
  const quality = await plan(body({ quality: 0.8, reliability: 0.2, delivery: 0 }), catalog);
  const delivery = await plan(body({ quality: 0, reliability: 0, delivery: 1 }), catalog);
  assert.deepEqual(productIds(quality.strategies.BEST_VALUE), ["MS-GOODx1"]);
  assert.deepEqual(productIds(delivery.strategies.BEST_VALUE), ["MS-FASTx1"]);
});
