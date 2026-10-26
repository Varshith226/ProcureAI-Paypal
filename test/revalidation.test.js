"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const { normalizeProducts } = require("../src/catalogProvider");
const { createPlanStore } = require("../src/planStore");
const { createProcurementRouter, procurementJsonErrorHandler } = require("../src/routes/procurement");
const { buildPlan, summarizeSpecs } = require("../src/planService");
const { product, request } = require("./helpers");

/** A catalog whose records the test can change between calls, like a live source. */
function mutableProvider(rawProducts) {
  const state = { raw: rawProducts.map((p) => ({ ...p })) };
  return {
    state,
    describe: () => ({ providerType: "test", catalogId: "test-catalog", catalogVersion: "1", dataOrigin: "SYNTHETIC_DEMO", disclaimer: null }),
    async listProducts({ categories } = {}) {
      const { products, loadWarnings } = normalizeProducts(state.raw, "SYNTHETIC_DEMO");
      return { products: categories ? products.filter((p) => categories.includes(p.category)) : products, loadWarnings };
    },
    set(id, changes) {
      const p = state.raw.find((r) => r.productId === id);
      Object.assign(p, changes);
    },
    remove(id) {
      state.raw = state.raw.filter((r) => r.productId !== id);
    },
  };
}

const catalog = () => [
  product("MON-A", "monitor", { unitPriceINR: 10000, specs: { refreshRateHz: 165, panel: "IPS" } }),
  product("KB-A", "keyboard", { unitPriceINR: 3000, shippingINR: 99 }),
  product("MS-A", "mouse", { unitPriceINR: 1500 }),
  product("HP-A", "headphones", { unitPriceINR: 4000 }),
];

async function startApp(provider) {
  const store = createPlanStore();
  const app = express();
  app.use(express.json());
  app.use("/api/procurement", createProcurementRouter({ catalogProvider: provider, planStore: store }));
  app.use("/api/procurement", procurementJsonErrorHandler);
  const server = await new Promise((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}/api/procurement`;
  const call = async (method, path, body) => {
    const res = await fetch(base + path, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, body: await res.json() };
  };
  return { call, store, close: () => new Promise((r) => server.close(r)) };
}

test("generated plans are stored server-side and can be fetched by planId and strategy", async () => {
  const provider = mutableProvider(catalog());
  const app = await startApp(provider);
  try {
    const { body: plan } = await app.call("POST", "/plan", request({ budgetINR: 30000 }));
    assert.equal(app.store.size(), 1);
    const fetched = await app.call("GET", `/plans/${plan.planId}`);
    assert.equal(fetched.status, 200);
    assert.deepEqual(fetched.body, plan);
    const strat = await app.call("GET", `/plans/${plan.planId}/strategies/BEST_VALUE`);
    assert.equal(strat.body.totalINR, 18599);
    assert.equal((await app.call("GET", "/plans/plan_nope")).body.error, "PLAN_NOT_FOUND");
    assert.equal((await app.call("GET", `/plans/${plan.planId}/strategies/NOPE`)).body.error, "STRATEGY_NOT_FOUND");
  } finally {
    await app.close();
  }
});

test("revalidate: unchanged catalog -> VALID and safe to check out", async () => {
  const provider = mutableProvider(catalog());
  const app = await startApp(provider);
  try {
    const { body: plan } = await app.call("POST", "/plan", request({ budgetINR: 30000 }));
    const r = await app.call("POST", `/plans/${plan.planId}/revalidate`, { strategyKey: "BEST_VALUE" });
    assert.equal(r.status, 200);
    assert.equal(r.body.status, "VALID");
    assert.equal(r.body.canProceedToCheckout, true);
    assert.equal(r.body.currentTotalINR, 18599);
    assert.equal(r.body.differenceINR, 0);
  } finally {
    await app.close();
  }
});

test("revalidate: price rise that still fits the budget -> CHANGED with exact difference", async () => {
  const provider = mutableProvider(catalog());
  const app = await startApp(provider);
  try {
    const { body: plan } = await app.call("POST", "/plan", request({ budgetINR: 30000 }));
    provider.set("MON-A", { unitPriceINR: 12500 });
    provider.set("KB-A", { shippingINR: 149 });
    const r = (await app.call("POST", `/plans/${plan.planId}/revalidate`, { strategyKey: "BEST_VALUE" })).body;
    assert.equal(r.status, "CHANGED");
    assert.equal(r.canProceedToCheckout, false);
    assert.equal(r.approvedTotalINR, 18599);
    assert.equal(r.currentTotalINR, 21149);
    assert.equal(r.differenceINR, 2550);
    assert.deepEqual(
      r.changes.map((c) => `${c.productId}.${c.field}:${c.before}->${c.after}`).sort(),
      ["KB-A.shippingINR:99->149", "MON-A.unitPriceINR:10000->12500"]
    );
    assert.match(r.summary, /increased by ₹2,550/);
    // the stored plan itself is untouched
    assert.equal((await app.call("GET", `/plans/${plan.planId}`)).body.strategies.BEST_VALUE.totalINR, 18599);
  } finally {
    await app.close();
  }
});

test("revalidate: INVALID when the new total exceeds the budget, stock runs out, delivery slips, a spec is lost, or the product vanishes", async () => {
  const scenarios = [
    ["budget", (p) => p.set("HP-A", { unitPriceINR: 20000 }), /exceeds the ₹30,000 budget/],
    ["stock", (p) => p.set("MS-A", { stockQuantity: 0 }), /Out of stock/],
    ["delivery", (p) => p.set("KB-A", { deliveryDays: 12 }), /12 days; the maximum allowed is 7/],
    ["spec", (p) => p.set("MON-A", { specs: { refreshRateHz: 60 } }), /60 Hz; at least 144 Hz/],
    ["unknown", (p) => p.set("MON-A", { shippingINR: null }), /Shipping cost is unknown/],
    ["missing", (p) => p.remove("HP-A"), /no longer in the catalog/],
  ];
  for (const [name, mutate, pattern] of scenarios) {
    const provider = mutableProvider(catalog());
    const app = await startApp(provider);
    try {
      const { body: plan } = await app.call("POST", "/plan", request({ budgetINR: 30000 }));
      mutate(provider);
      const r = (await app.call("POST", `/plans/${plan.planId}/revalidate`, { strategyKey: "BEST_VALUE" })).body;
      assert.equal(r.status, "INVALID", name);
      assert.equal(r.canProceedToCheckout, false, name);
      assert.match(r.summary, pattern, name);
      assert.ok(r.problems.length >= 1, name);
    } finally {
      await app.close();
    }
  }
});

test("revalidate: stock below the approved quantity is INVALID", async () => {
  const provider = mutableProvider([product("MS-A", "mouse", { stockQuantity: 5 })]);
  const app = await startApp(provider);
  try {
    const body = request({ requiredCategories: [{ category: "mouse", quantity: 3 }], hardConstraints: {} });
    const { body: plan } = await app.call("POST", "/plan", body);
    provider.set("MS-A", { stockQuantity: 2 });
    const r = (await app.call("POST", `/plans/${plan.planId}/revalidate`, { strategyKey: "BEST_VALUE" })).body;
    assert.equal(r.status, "INVALID");
    assert.match(r.summary, /exceeds available stock of 2/);
  } finally {
    await app.close();
  }
});

test("revalidate: controlled errors for a missing strategyKey, unknown plan or unknown strategy", async () => {
  const app = await startApp(mutableProvider(catalog()));
  try {
    const { body: plan } = await app.call("POST", "/plan", request({ budgetINR: 30000 }));
    assert.equal((await app.call("POST", `/plans/${plan.planId}/revalidate`, {})).status, 400);
    assert.equal((await app.call("POST", "/plans/plan_nope/revalidate", { strategyKey: "BEST_VALUE" })).status, 404);
    const unknown = await app.call("POST", `/plans/${plan.planId}/revalidate`, { strategyKey: "CHEAPEST" });
    assert.equal(unknown.status, 404); // single-basket catalog: CHEAPEST was omitted
    assert.equal(unknown.body.error, "STRATEGY_NOT_FOUND");
  } finally {
    await app.close();
  }
});

test("a catalog change produces a new planId, so an approved plan is never silently overwritten", async () => {
  const provider = mutableProvider(catalog());
  const before = await buildPlan(request(), provider);
  const again = await buildPlan(request(), provider);
  provider.set("MS-A", { unitPriceINR: 1499 });
  const after = await buildPlan(request(), provider);
  assert.equal(before.planId, again.planId);
  assert.notEqual(before.planId, after.planId);
});

test("stored plans are immutable and the store evicts the oldest beyond its limit", () => {
  const store = createPlanStore({ maxPlans: 2 });
  const plan = { planId: "p1", strategies: { BEST_VALUE: { totalINR: 100 } } };
  store.save(plan, { budgetINR: 1 });
  plan.strategies.BEST_VALUE.totalINR = 1; // caller mutates its own copy
  assert.equal(store.getStrategy("p1", "BEST_VALUE").totalINR, 100);
  assert.throws(() => {
    "use strict";
    store.get("p1").plan.strategies.BEST_VALUE.totalINR = 5;
  }, TypeError);
  store.save({ planId: "p2" }, {});
  store.save({ planId: "p3" }, {});
  assert.equal(store.get("p1"), null);
  assert.equal(store.size(), 2);
});

test("display helpers: specsSummary and withinBudget", async () => {
  assert.equal(summarizeSpecs({ refreshRateHz: 170, panel: "IPS", resolution: "1440p", sizeInches: 27 }), '170 Hz · IPS · 1440p · 27"');
  assert.equal(summarizeSpecs({ dpi: 26000, connectivity: "wired", weightGrams: 58 }), "26,000 DPI · wired · 58 g");
  assert.equal(summarizeSpecs({ anc: true, refreshRateHz: null }), "ANC");
  const plan = await buildPlan(request({ budgetINR: 30000 }), mutableProvider(catalog()));
  const bv = plan.strategies.BEST_VALUE;
  assert.equal(bv.withinBudget, true);
  assert.equal(bv.items.find((i) => i.productId === "MON-A").specsSummary, "165 Hz · IPS");
});

const { createStaticCatalogProvider, createDemoOverlayProvider } = require("../src/catalogProvider");

async function startOverlayApp(products, meta, routerOpts = {}) {
  const provider = createDemoOverlayProvider(createStaticCatalogProvider(products, meta));
  const app = express();
  app.use(express.json());
  app.use("/api/procurement", createProcurementRouter({ catalogProvider: provider, planStore: createPlanStore(), ...routerOpts }));
  const server = await new Promise((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}/api/procurement`;
  const call = async (method, path, body) => {
    const res = await fetch(base + path, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: res.status, body: await res.json() };
  };
  const rawStatus = async (method, path) => (await fetch(base + path, { method })).status;
  return { call, rawStatus, close: () => new Promise((r) => server.close(r)) };
}

test("demo overrides: a real price spike flows through revalidation, and reset restores VALID", async () => {
  const app = await startOverlayApp(catalog(), { dataOrigin: "SYNTHETIC_DEMO" });
  try {
    const { body: plan } = await app.call("POST", "/plan", request({ budgetINR: 30000 }));
    const o = await app.call("POST", "/demo/catalog-overrides", { productId: "MON-A", unitPriceINR: 12500 });
    assert.equal(o.status, 200);
    const changed = (await app.call("POST", `/plans/${plan.planId}/revalidate`, { strategyKey: "BEST_VALUE" })).body;
    assert.equal(changed.status, "CHANGED");
    assert.equal(changed.differenceINR, 2500);
    await app.call("DELETE", "/demo/catalog-overrides");
    const valid = (await app.call("POST", `/plans/${plan.planId}/revalidate`, { strategyKey: "BEST_VALUE" })).body;
    assert.equal(valid.status, "VALID");
  } finally {
    await app.close();
  }
});

test("demo overrides are validated and refused on non-demo catalogs or when disabled", async () => {
  const demo = await startOverlayApp(catalog(), { dataOrigin: "SYNTHETIC_DEMO" });
  try {
    assert.equal((await demo.call("POST", "/demo/catalog-overrides", { productId: "MON-A", unitPriceINR: -5 })).status, 400);
    assert.equal((await demo.call("POST", "/demo/catalog-overrides", { productId: "MON-A", name: "hacked" })).status, 400);
    assert.equal((await demo.call("POST", "/demo/catalog-overrides", { productId: "NOPE", unitPriceINR: 1 })).status, 404);
    assert.equal((await demo.call("POST", "/demo/catalog-overrides", { unitPriceINR: 1 })).status, 400);
  } finally {
    await demo.close();
  }
  const real = await startOverlayApp(
    catalog().map((p) => ({ ...p, provenance: { dataOrigin: "CATALOG_UNCHECKED" } })),
    { dataOrigin: "CATALOG_UNCHECKED" }
  );
  try {
    const r = await real.call("POST", "/demo/catalog-overrides", { productId: "MON-A", unitPriceINR: 1 });
    assert.equal(r.status, 403);
    assert.equal(r.body.error, "DEMO_OVERRIDE_REJECTED");
  } finally {
    await real.close();
  }
  const off = await startOverlayApp(catalog(), { dataOrigin: "SYNTHETIC_DEMO" }, { enableDemoRoutes: false });
  try {
    assert.equal(await off.rawStatus("GET", "/demo/catalog-overrides"), 404); // route not mounted
  } finally {
    await off.close();
  }
});
