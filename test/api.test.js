"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

// Make sure loading server.js never needs real credentials.
delete process.env.PAYPAL_CLIENT_ID;
delete process.env.PAYPAL_CLIENT_SECRET;
delete process.env.PAYPAL_BASE_URL;

const app = require("../server");
const sample = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "examples", "request-60k-setup.json"), "utf8"));

let server;
let base;
const realFetch = globalThis.fetch;

test.before(async () => {
  await new Promise((resolve) => {
    server = app.listen(0, "127.0.0.1", resolve);
  });
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => new Promise((resolve) => server.close(resolve)));

const post = (url, body, headers = { "Content-Type": "application/json" }) =>
  realFetch(base + url, { method: "POST", headers, body: typeof body === "string" ? body : JSON.stringify(body) });

test("(1) POST /api/procurement/plan returns a DRAFT plan for the ₹60,000 setup", async () => {
  const res = await post("/api/procurement/plan", sample);
  assert.equal(res.status, 200);
  const p = await res.json();
  assert.equal(p.status, "DRAFT");
  assert.equal(p.requestId, "req_2026_01");
  assert.equal(p.currency, "INR");
  const bv = p.strategies.BEST_VALUE;
  assert.deepEqual([...new Set(bv.items.map((i) => i.category))].sort(), ["headphones", "keyboard", "monitor", "mouse"]);
  assert.ok(bv.items.find((i) => i.category === "monitor").specs.refreshRateHz >= 144);
  assert.ok(bv.totalINR <= 60000);
  assert.ok(!bv.items.some((i) => /laptop/i.test(i.category)));
});

test("(16) invalid payloads return controlled JSON 400 errors", async () => {
  const cases = [
    ["{not json", { "Content-Type": "application/json" }],
    ["[]", { "Content-Type": "application/json" }],
    [JSON.stringify({ ...sample, budgetINR: -1 }), { "Content-Type": "application/json" }],
    [JSON.stringify({ ...sample, weights: { quality: 0.9, reliability: 0.9, delivery: 0.9 } }), { "Content-Type": "application/json" }],
    ["requestId=x", { "Content-Type": "text/plain" }],
  ];
  for (const [body, headers] of cases) {
    const res = await post("/api/procurement/plan", body, headers);
    assert.equal(res.status, 400, body);
    const json = await res.json();
    assert.equal(json.error, "INVALID_REQUEST");
    assert.ok(Array.isArray(json.details) && json.details.length > 0);
  }
});

test("(12) an over-tight budget returns 200 with status INFEASIBLE", async () => {
  const res = await post("/api/procurement/plan", { ...sample, budgetINR: 5000 });
  assert.equal(res.status, 200);
  const p = await res.json();
  assert.equal(p.status, "INFEASIBLE");
  assert.deepEqual(p.strategies, {});
  assert.ok(p.infeasibility.cheapestPossibleTotalINR > 5000);
});

test("(18) planning never calls PayPal (or any network) and never captures payment", async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    throw new Error("network must not be used while planning");
  };
  try {
    const res = await post("/api/procurement/plan", sample);
    assert.equal(res.status, 200);
  } finally {
    globalThis.fetch = realFetch;
  }
  assert.equal(calls, 0);
});

test("(18) existing routes still behave as before", async () => {
  const root = await (await realFetch(base + "/")).json();
  assert.equal(root.message, "PayPal AI Hackathon backend is running!");
  const status = await (await realFetch(base + "/api/paypal/status")).json();
  assert.deepEqual(status, { configured: false, environment: "sandbox" });
  const capture = await post("/api/paypal/capture-order", {});
  assert.equal(capture.status, 400);
  assert.deepEqual(await capture.json(), { error: "orderID is required" });
});

test("GET /api/procurement/catalog and /contract", async () => {
  const cat = await (await realFetch(base + "/api/procurement/catalog?category=monitor")).json();
  assert.equal(cat.catalog.dataOrigin, "SYNTHETIC_DEMO");
  assert.ok(cat.products.length > 0 && cat.products.every((p) => p.category === "monitor"));
  const contract = await (await realFetch(base + "/api/procurement/contract")).json();
  assert.equal(contract.supportedHardConstraints.monitor.minRefreshRateHz.kind, "min");
});
