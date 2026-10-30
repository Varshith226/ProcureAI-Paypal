"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createAIService, buildBrief } = require("../src/aiService");
const { createPlanStore } = require("../src/planStore");
const { extraction, condition, product, provider } = require("./helpers");
const sample = require("../examples/request-60k-setup.json");
const context = { requestId: sample.requestId, messages: [sample.rawQuery], referenceDate: "2026-10-30" };
const brief = (data, messages = context.messages) => buildBrief(data, { ...context, messages });
const item = (category = "monitor", quantity = 1, constraints = [], unit = "unit") => ({ category, quantity, constraints, unit, required: true });

test("general extraction preserves the exact v1 request for the original setup", () => {
  const result = brief(extraction());
  assert.equal(result.status, "READY");
  assert.deepEqual(result.request, sample);
  assert.equal(result.contractVersion, 2);
  assert.equal(result.requirements.items.length, 4);
  assert.equal(result.canOptimize, true);
});

test("real optimizer still returns and stores the three exact demo baskets", async () => {
  const store = createPlanStore();
  const result = await createAIService({ extract: async () => extraction(), planStore: store }).plan({ requestId: context.requestId, messages: context.messages });
  assert.equal(result.status, "PLANNED");
  assert.deepEqual(Object.fromEntries(Object.entries(result.plan.strategies).map(([key, value]) => [key, value.totalINR])), { CHEAPEST: 12292, BEST_VALUE: 54996, ALTERNATIVE: 50296 });
  assert.deepEqual(store.get(result.plan.planId).plan, result.plan);
  assert.equal(result.recommendation.verificationLevel, "UNVERIFIED_DEMO_DATA");
  assert.equal(result.recommendation.requiresUserApproval, true);
});

test("arbitrary categories remain structured even with unsupported specifications", () => {
  for (const [category, attribute, value, unit] of [["chair", "weightCapacity", 120, "kg"], ["tablet", "ramGB", 16, "GB"], ["shirt", "size", "XL", null], ["rice", "organic", true, null], ["printer", "duplex", true, null], ["subscription", "seats", 5, null], ["plumbing_service", "installation", true, null]]) {
    const quote = `Must have ${attribute} ${value}`;
    const data = extraction({ items: [item(category, 2, [condition(attribute, typeof value === "number" ? "gte" : "eq", value, quote, unit)])] });
    const result = brief(data, [`Buy two ${category}. ${quote}. Budget INR 60000, 7 days.`]);
    assert.equal(result.status, "ENGINE_SUPPORT_REQUIRED", category);
    assert.equal(result.understandingStatus, "READY");
    assert.deepEqual(result.requirements.items, data.items);
    assert.equal(result.request, null);
    assert.deepEqual(result.questions, []);
  }
});

test("new catalog categories are not rejected simply for being non-electronics", async () => {
  const result = await createAIService({ extract: async () => extraction({ items: [item("chair", 10)] }) }).plan({ messages: ["10 chairs, INR 60000 total, 7 days"] });
  assert.equal(result.status, "INFEASIBLE");
  assert.equal(result.requirements.items[0].quantity, 10);
  assert.ok(result.plan.infeasibility.reasons.length);
});

test("a new category actually plans once catalog data exists, without parser category changes", async () => {
  const data = extraction({ items: [item("chair", 2, [condition("warrantyMonths", "gte", 12, "12-month warranty", "months")])] });
  const api = createAIService({ extract: async () => data, catalogProvider: provider([product("CHAIR-DEMO", "chair", { warrantyMonths: 24 })]) });
  const result = await api.plan({ messages: ["Buy 2 chairs, INR 60000 total, 7 days, with a 12-month warranty."] });
  assert.equal(result.status, "PLANNED");
  assert.equal(result.request.requiredCategories[0].category, "chair");
  const basket = Object.values(result.plan.strategies)[0];
  assert.equal(basket.totalINR, 2000);
  assert.equal(basket.items[0].quantity, 2);
});

test("missing budget, currency, deadline, category and quantities trigger actual questions", () => {
  const result = brief(extraction({ budget: { amount: null, currency: null }, delivery: { maxDays: null }, items: [item("chair", null)] }));
  assert.equal(result.status, "NEEDS_CLARIFICATION");
  for (const field of ["budgetINR", "budget.currency", "maxDeliveryDays", "requiredCategories[0].quantity"]) assert.ok(result.questions.some((q) => q.field === field));
  assert.equal(result.request, null);
  assert.ok(brief(extraction({ items: [] })).questions.some((q) => q.field === "requiredCategories"));
});

test("incomplete or unsupported requests never call the optimizer/catalog", async () => {
  const data = extraction({ budget: { amount: null } });
  const api = createAIService({ extract: async () => data, catalogProvider: { listProducts() { assert.fail("Must not plan"); } } });
  assert.equal((await api.plan({ messages: context.messages })).status, "NEEDS_CLARIFICATION");
});

test("invalid values ask for correction without changing the user's original requirements", () => {
  for (const data of [extraction({ budget: { amount: -1 } }), extraction({ budget: { amount: 0 } }), extraction({ budget: { amount: 1.234 } }), extraction({ budget: { minAmount: 70000 } }), extraction({ delivery: { maxDays: -1 } }), extraction({ delivery: { maxDays: 1.5 } }), extraction({ items: [item("chair", 0)] }), extraction({ items: [item("chair", -2)] }), extraction({ items: [item("chair", 1.5)] }), extraction({ weights: { quality: .8, reliability: .8, delivery: .8 } })]) {
    const result = brief(data);
    assert.equal(result.status, "NEEDS_CLARIFICATION");
    assert.deepEqual(result.requirements.budget, data.budget);
    assert.equal(result.plan, null);
  }
});

test("valid bulk units, high quantities, currencies and budget scopes are preserved as engine gaps", () => {
  for (const data of [extraction({ items: [item("rice", .5, [], "kg")] }), extraction({ items: [item("chair", 500)] }), extraction({ budget: { amount: 200, currency: "USD" } }), extraction({ budget: { scope: "PER_ITEM" } }), extraction({ budget: { unlimited: true, amount: null } }), extraction({ budget: { minAmount: 10000 } }), extraction({ budget: { includesShipping: false } }), extraction({ delivery: { maxDays: 500 } }), extraction({ delivery: { destination: "Bengaluru 560001" } })]) {
    const result = brief(data);
    assert.equal(result.status, "ENGINE_SUPPORT_REQUIRED");
    assert.equal(result.understandingStatus, "READY");
    assert.ok(result.unsupportedRequirements.length);
    assert.equal(result.request, null);
  }
});

test("units are converted only when a registered rule supports them", () => {
  const quote = "2-year warranty and 60 cm screen";
  const result = brief(extraction({ items: [item("monitor", 1, [condition("warrantyMonths", "gte", 2, quote, "years"), condition("sizeInches", "gte", 60, quote, "cm")])] }), [quote]);
  assert.equal(result.status, "READY");
  assert.equal(result.request.hardConstraints.monitor.minWarrantyMonths, 24);
  assert.ok(Math.abs(result.request.hardConstraints.monitor.minSizeInches - 60 / 2.54) < .00001);
  const wrong = brief(extraction({ items: [item("monitor", 1, [condition("sizeInches", "gte", 60, quote, "USD")])] }), [quote]);
  assert.equal(wrong.status, "ENGINE_SUPPORT_REQUIRED");
});

test("exact equality is never weakened to a minimum-only rule", () => {
  const quote = "exactly 144 Hz";
  const result = brief(extraction({ items: [item("monitor", 1, [condition("refreshRateHz", "eq", 144, quote, "Hz")])] }), [quote]);
  assert.equal(result.status, "ENGINE_SUPPORT_REQUIRED");
  const size = brief(extraction({ items: [item("monitor", 1, [condition("sizeInches", "eq", 24, "24 inches", "inches")])] }), ["24 inches"]);
  assert.deepEqual(size.request.hardConstraints.monitor, { minSizeInches: 24, maxSizeInches: 24 });
});

test("global warranty and exclusions apply to all items", () => {
  const quote = "1-year warranty; exclude Acme";
  const result = brief(extraction({ globalConstraints: [condition("warrantyMonths", "gte", 12, quote, "months"), condition("brand", "not_in", ["Acme"], quote)] }), [sample.rawQuery, quote]);
  assert.equal(result.status, "READY");
  for (const { category } of sample.requiredCategories) {
    assert.equal(result.request.hardConstraints[category].minWarrantyMonths, 12);
    assert.deepEqual(result.request.hardConstraints[category].excludedBrands, ["Acme"]);
  }
});

test("soft arbitrary attributes stay optional and are disclosed", () => {
  const quote = "prefer purple";
  const result = brief(extraction({ items: [item("keyboard", 1, [condition("colour", "eq", "purple", quote, null, "SOFT")])] }), [quote]);
  assert.equal(result.status, "READY");
  assert.deepEqual(result.request.hardConstraints, {});
  assert.equal(result.requirements.items[0].constraints[0].importance, "SOFT");
  assert.ok(result.assumptions.some((entry) => entry.includes("not independently scored")));
});

test("contradictory hard bounds and exclusions require clarification", () => {
  for (const conditions of [[condition("sizeInches", "gte", 30, "size"), condition("sizeInches", "lte", 24, "size")], [condition("brand", "in", ["Acme"], "brand"), condition("brand", "not_in", ["Acme"], "brand")], [condition("panel", "eq", "IPS", "panel"), condition("panel", "eq", "VA", "panel")]]) {
    const result = brief(extraction({ items: [item("monitor", 1, conditions)] }), ["size brand panel"]);
    assert.equal(result.status, "NEEDS_CLARIFICATION");
    assert.equal(result.request, null);
  }
});

test("invented constraint quotes and malformed comparison values fail closed", () => {
  for (const c of [condition("ramGB", "gte", 16, "not in messages"), condition("sizeInches", "between", [30, 20], "size"), condition("brand", "in", [], "brand")]) {
    assert.equal(brief(extraction({ items: [item("monitor", 1, [c])] }), ["size brand"]).status, "NEEDS_CLARIFICATION");
  }
});

test("cross-unit contradictions and exact excluded brands cannot reach optimization", () => {
  const conditions = [condition("warrantyMonths", "gte", 2, "warranty", "years"), condition("warrantyMonths", "lte", 12, "warranty", "months")];
  assert.equal(brief(extraction({ items: [item("monitor", 1, conditions)] }), ["warranty"]).status, "NEEDS_CLARIFICATION");
  const brands = [condition("brand", "eq", "Acme", "brand"), condition("brand", "not_in", ["ACME"], "brand")];
  assert.equal(brief(extraction({ items: [item("monitor", 1, brands)] }), ["brand"]).status, "NEEDS_CLARIFICATION");
  const equalBrands = [condition("brand", "eq", "Acme", "brand"), condition("brand", "eq", "acme", "brand")];
  assert.equal(brief(extraction({ items: [item("monitor", 1, equalBrands)] }), ["brand"]).status, "READY");
});

test("negative physical bounds require correction, but a negative generic temperature is preserved", () => {
  assert.equal(brief(extraction({ items: [item("monitor", 1, [condition("refreshRateHz", "gte", -1, "frequency")])] }), ["frequency"]).status, "NEEDS_CLARIFICATION");
  const cold = brief(extraction({ items: [item("freezer", 1, [condition("temperature", "lte", -20, "-20 C", "C")])] }), ["-20 C"]);
  assert.equal(cold.status, "ENGINE_SUPPORT_REQUIRED");
  assert.equal(cold.requirements.items[0].constraints[0].value, -20);
  assert.equal(brief(extraction({ budget: { amount: 1e20 } })).status, "NEEDS_CLARIFICATION");
});

test("duplicate equivalent categories combine, distinct variants stay separate", () => {
  const result = brief(extraction({ items: [item("keyboard", 2), item("keyboard", 3)] }));
  assert.deepEqual(result.request.requiredCategories, [{ category: "keyboard", quantity: 5 }]);
  const variants = brief(extraction({ items: [item("monitor", 1, [condition("panel", "eq", "IPS", "IPS")]), item("monitor", 1, [condition("panel", "eq", "VA", "VA")])] }), ["IPS and VA monitors"]);
  assert.equal(variants.status, "ENGINE_SUPPORT_REQUIRED");
  assert.equal(variants.requirements.items.length, 2);
});

test("dates are grounded to the server's reference date, including invalid calendar days", () => {
  assert.equal(brief(extraction({ delivery: { maxDays: null, deadlineISO: "2026-10-31" } })).request.maxDeliveryDays, 1);
  assert.equal(brief(extraction({ delivery: { maxDays: 0 } })).request.maxDeliveryDays, 0);
  for (const date of ["2026-10-29", "2026-02-30", "31/10/2026"]) assert.equal(brief(extraction({ delivery: { maxDays: null, deadlineISO: date } })).status, "NEEDS_CLARIFICATION");
  const unbounded = brief(extraction({ delivery: { maxDays: null, unrestricted: true } }));
  assert.equal(unbounded.request.maxDeliveryDays, 365);
  assert.equal(unbounded.requirements.delivery.unrestricted, true);
});

test("server date/timezone and full conversation reach the extractor", async () => {
  let seen;
  const api = createAIService({ now: () => new Date("2026-10-29T20:00:00Z"), extract: async (...args) => { seen = args; return extraction(); } });
  const messages = [sample.rawQuery, "Keep the budget and quantity unchanged."];
  const result = await api.parse({ messages });
  assert.deepEqual(seen, [messages, { referenceDate: "2026-10-30", referenceTime: "2026-10-29T20:00:00.000Z", timezone: "Asia/Kolkata" }]);
  assert.equal(result.referenceDate, "2026-10-30");
  assert.equal(result.request.rawQuery, messages.join("\nFollow-up: "));
});

test("unrelated and cancelled requests never plan or call the catalog", async () => {
  for (const [intent, status] of [["NON_PROCUREMENT", "NOT_PROCUREMENT"], ["CANCEL", "CANCELLED"]]) {
    const result = await createAIService({ extract: async () => extraction({ intent, items: [] }), catalogProvider: { listProducts() { assert.fail("No shopping"); } } }).plan({ messages: ["hello/cancel"] });
    assert.equal(result.status, status);
    assert.equal(result.request, null);
    assert.equal(result.plan, null);
    assert.deepEqual(result.questions, []);
  }
});

test("malformed model output is rejected before it can reach the optimizer", () => {
  const missing = extraction(); delete missing.intent;
  for (const data of [null, [], {}, missing, extraction({ intent: "PAY" }), extraction({ budget: null }), extraction({ items: [item("chair", "two")] }), extraction({ ambiguities: Array(31).fill("question") }), { ...extraction(), price: 100 }]) {
    assert.throws(() => brief(data), { code: "AI_INVALID_OUTPUT" });
  }
});

test("unsafe category names cannot modify JavaScript prototypes", () => {
  for (const category of ["__proto__", "constructor", "prototype"]) assert.equal(brief(extraction({ items: [item(category)] })).status, "NEEDS_CLARIFICATION");
  assert.equal({}.polluted, undefined);
});

test("invalid HTTP-level input is rejected before spending an AI call", async () => {
  const api = createAIService({ extract() { assert.fail("Invalid input must not reach AI"); } });
  for (const body of [null, [], {}, { messages: [] }, { messages: [""] }, { messages: [42] }, { messages: ["x".repeat(8001)] }, { messages: Array(101).fill("x") }, { messages: Array(3).fill("x".repeat(6000)) }, { messages: ["x"], requestId: " " }, { messages: ["x"], draft: {} }]) await assert.rejects(api.parse(body), { code: "INVALID_AI_REQUEST", statusCode: 400 });
});

test("optional items and quantity ranges are never forced into mandatory fixed-size baskets", () => {
  const optional = item("keyboard"); optional.required = false;
  assert.equal(brief(extraction({ items: [optional] })).status, "ENGINE_SUPPORT_REQUIRED");
  const ranged = item("chair", null, [condition("quantity", "between", [5, 10], "5 to 10 chairs")]);
  const result = brief(extraction({ items: [ranged] }), ["5 to 10 chairs"]);
  assert.equal(result.status, "ENGINE_SUPPORT_REQUIRED");
  assert.equal(result.requirements.items[0].quantity, null);
  assert.deepEqual(result.questions, []);
  const quote = "buy a keyboard only if the monitor costs less than INR 15000";
  const conditional = brief(extraction({ globalConstraints: [condition("purchaseCondition", "contains", quote, quote)] }), [sample.rawQuery, quote]);
  assert.equal(conditional.status, "ENGINE_SUPPORT_REQUIRED");
  assert.equal(conditional.request, null);
  assert.equal(conditional.requirements.globalConstraints[0].value, quote);
});
