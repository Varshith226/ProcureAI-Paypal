"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { validateRequest, DEFAULT_WEIGHTS } = require("../src/requestValidator");
const { request } = require("./helpers");

const fieldsOf = (result) => result.errors.map((e) => e.field);

test("accepts the canonical ₹60,000 setup request unchanged", () => {
  const r = validateRequest(request());
  assert.equal(r.ok, true);
  assert.equal(r.value.budgetINR, 60000);
  assert.deepEqual(r.value.weights, { quality: 0.45, reliability: 0.35, delivery: 0.2 });
  assert.equal(r.value.weightsSource, "REQUEST");
  assert.deepEqual(r.warnings, []);
});

test("(11) weights that do not sum to 1 are rejected, not normalized", () => {
  const r = validateRequest(request({ weights: { quality: 0.5, reliability: 0.5, delivery: 0.5 } }));
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.field === "weights" && /sum to 1/.test(e.message)));
});

test("(11) missing weights fall back to documented defaults with a warning", () => {
  const body = request();
  delete body.weights;
  const r = validateRequest(body);
  assert.equal(r.ok, true);
  assert.deepEqual(r.value.weights, { ...DEFAULT_WEIGHTS });
  assert.equal(r.value.weightsSource, "DEFAULT");
  assert.match(r.warnings[0], /default weights/i);
});

test("(11) partial, negative, non-numeric or extra weights are rejected", () => {
  assert.deepEqual(fieldsOf(validateRequest(request({ weights: { quality: 1 } }))), ["weights.reliability", "weights.delivery"]);
  assert.ok(fieldsOf(validateRequest(request({ weights: { quality: 1.2, reliability: -0.2, delivery: 0 } }))).includes("weights.quality"));
  assert.ok(fieldsOf(validateRequest(request({ weights: { quality: "0.45", reliability: 0.35, delivery: 0.2 } }))).includes("weights.quality"));
  assert.ok(fieldsOf(validateRequest(request({ weights: { quality: 0.45, reliability: 0.35, delivery: 0.2, price: 0 } }))).includes("weights"));
});

test("(16) malformed payloads produce field-level errors", () => {
  assert.deepEqual(fieldsOf(validateRequest([])), ["(body)"]);
  assert.deepEqual(fieldsOf(validateRequest(null)), ["(body)"]);
  assert.ok(fieldsOf(validateRequest(request({ requestId: "" }))).includes("requestId"));
  assert.ok(fieldsOf(validateRequest(request({ budgetINR: 0 }))).includes("budgetINR"));
  assert.ok(fieldsOf(validateRequest(request({ budgetINR: "60000" }))).includes("budgetINR"));
  assert.ok(fieldsOf(validateRequest(request({ budgetINR: 100.555 }))).includes("budgetINR"));
  assert.ok(fieldsOf(validateRequest(request({ maxDeliveryDays: -1 }))).includes("maxDeliveryDays"));
  assert.ok(fieldsOf(validateRequest(request({ maxDeliveryDays: 2.5 }))).includes("maxDeliveryDays"));
  assert.ok(fieldsOf(validateRequest(request({ requiredCategories: [] }))).includes("requiredCategories"));
  assert.ok(
    fieldsOf(validateRequest(request({ requiredCategories: [{ category: "mouse", quantity: 0 }] }))).includes("requiredCategories[0].quantity")
  );
  assert.ok(
    fieldsOf(validateRequest(request({ requiredCategories: [{ category: "mouse", quantity: 1.5 }] }))).includes("requiredCategories[0].quantity")
  );
  assert.ok(
    fieldsOf(
      validateRequest(request({ requiredCategories: [{ category: "mouse", quantity: 1 }, { category: "Mouse", quantity: 2 }], hardConstraints: {} }))
    ).includes("requiredCategories[1].category")
  );
});

test("(16) unknown or misplaced hard constraints are rejected instead of ignored", () => {
  // typo in key
  assert.ok(
    fieldsOf(validateRequest(request({ hardConstraints: { monitor: { minRefreshRate: 144 } } }))).includes("hardConstraints.monitor.minRefreshRate")
  );
  // constraint for a category that is not being bought (e.g. the laptop the user already owns)
  assert.ok(fieldsOf(validateRequest(request({ hardConstraints: { laptop: { minWarrantyMonths: 12 } } }))).includes("hardConstraints.laptop"));
  // wrong value type
  assert.ok(
    fieldsOf(validateRequest(request({ hardConstraints: { monitor: { minRefreshRateHz: "144" } } }))).includes("hardConstraints.monitor.minRefreshRateHz")
  );
});

test("category names are trimmed and lower-cased; nothing else is rewritten", () => {
  const r = validateRequest(
    request({ requiredCategories: [{ category: " Monitor ", quantity: 2 }], hardConstraints: { Monitor: { minRefreshRateHz: 144 } } })
  );
  assert.equal(r.ok, true);
  assert.deepEqual(r.value.requiredCategories, [{ category: "monitor", quantity: 2 }]);
  assert.deepEqual(r.value.hardConstraints, { monitor: { minRefreshRateHz: 144 } });
});

test("extra agent fields such as clarificationsNeeded are accepted and do not change the plan input", () => {
  const plain = validateRequest(request());
  const withExtra = validateRequest(request({ clarificationsNeeded: ["Wired or wireless mouse?"] }));
  assert.equal(withExtra.ok, true);
  assert.deepEqual(withExtra.value, plain.value);
});
