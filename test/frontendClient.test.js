"use strict";

// Exercises docs/integration/procurementApi.js (the file the frontend copies)
// against the real server, so the integration snippet can't silently rot.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const app = require("../server");
const sample = require("../examples/request-60k-setup.json");

let server;
let base;
let api;

test.before(async () => {
  // The client is an ES module; copy it to .mjs so this works on any Node >= 20.
  const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "procureai-")), "procurementApi.mjs");
  fs.copyFileSync(path.join(__dirname, "..", "docs", "integration", "procurementApi.js"), tmp);
  api = await import(pathToFileURL(tmp).href);
  await new Promise((resolve) => {
    server = app.listen(0, "127.0.0.1", resolve);
  });
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => new Promise((resolve) => server.close(resolve)));

test("client: generatePlan + toPlanViewModel give the shape App.jsx renders", async () => {
  const plan = await api.generatePlan(sample, base);
  const view = api.toPlanViewModel(plan);
  assert.equal(view.status, "DRAFT");
  assert.deepEqual(view.strategies.map((s) => s.strategyKey), ["CHEAPEST", "BEST_VALUE", "ALTERNATIVE"]);
  for (const s of view.strategies) {
    assert.equal(s.withinBudget, true);
    assert.ok(s.badgeColor);
    assert.ok(s.warnings.every((w) => typeof w.message === "string" && w.severity));
    for (const i of s.items) {
      assert.equal(typeof i.specs, "string"); // React can render it directly
      assert.equal(i.badge.label, "DEMO DATA"); // never "VERIFIED" for demo data
    }
  }
  assert.equal(view.isDemoData, true);
  assert.ok(view.rejectedProducts.length > 0);
});

test("client: revalidate + demo override round-trip", async () => {
  const plan = await api.generatePlan(sample, base);
  assert.equal((await api.revalidate(plan.planId, "BEST_VALUE", base)).status, "VALID");
  const monitor = plan.strategies.BEST_VALUE.items.find((i) => i.category === "monitor");
  await api.setDemoOverride({ productId: monitor.productId, unitPriceINR: monitor.unitPriceINR + 2500 }, base);
  try {
    const r = await api.revalidate(plan.planId, "BEST_VALUE", base);
    assert.equal(r.status, "CHANGED");
    assert.equal(r.differenceINR, 2500);
  } finally {
    await api.clearDemoOverrides(base);
  }
});

test("client: API errors become Error objects with code and field details", async () => {
  await assert.rejects(api.generatePlan({ requestId: "x" }, base), (e) => {
    assert.equal(e.status, 400);
    assert.equal(e.code, "INVALID_REQUEST");
    assert.ok(e.details.some((d) => d.field === "budgetINR"));
    return true;
  });
  const infeasible = api.toPlanViewModel(await api.generatePlan({ ...sample, budgetINR: 5000 }, base));
  assert.equal(infeasible.status, "INFEASIBLE");
  assert.deepEqual(infeasible.strategies, []);
  assert.ok(infeasible.infeasibility.reasons.length > 0);
});

test("checkoutGuard shares the API's plan store and catalog (incl. demo overrides)", async () => {
  const { getApprovedStrategy, revalidateForCheckout } = require("../src/checkoutGuard");
  const plan = await api.generatePlan(sample, base);
  const strategy = getApprovedStrategy(plan.planId, "BEST_VALUE");
  assert.equal(strategy.totalINR, plan.strategies.BEST_VALUE.totalINR);
  assert.ok(Object.isFrozen(strategy));
  assert.equal(getApprovedStrategy("plan_nope", "BEST_VALUE"), null);
  assert.equal(await revalidateForCheckout("plan_nope", "BEST_VALUE"), null);

  assert.equal((await revalidateForCheckout(plan.planId, "BEST_VALUE")).status, "VALID");
  const mouse = strategy.items.find((i) => i.category === "mouse");
  await api.setDemoOverride({ productId: mouse.productId, stockQuantity: 0 }, base);
  try {
    const r = await revalidateForCheckout(plan.planId, "BEST_VALUE");
    assert.equal(r.status, "INVALID");
    assert.equal(r.canProceedToCheckout, false);
  } finally {
    await api.clearDemoOverrides(base);
  }
});
