"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createAIService, buildBrief } = require("../src/aiService");
const { createPlanStore } = require("../src/planStore");
const { createStaticCatalogProvider } = require("../src/catalogProvider");
const { SYSTEM_INSTRUCTION } = require("../src/requestExtraction");
const sample = require("../examples/request-60k-setup.json");
const catalog = require("../src/catalog.json");

const conversation = { requestId: sample.requestId, messages: [sample.rawQuery] };
function extraction(overrides = {}) {
  return {
    budgetINR: sample.budgetINR, maxDeliveryDays: sample.maxDeliveryDays,
    requiredCategories: structuredClone(sample.requiredCategories),
    hardConstraints: structuredClone(sample.hardConstraints), weights: { ...sample.weights },
    ambiguities: [], unsupportedRequirements: [], assumptions: [], ...overrides,
  };
}
function service(draft, extra = {}) {
  return createAIService({ extract: async () => structuredClone(draft), ...extra });
}

test("request intelligence: canonical extraction preserves the agreed request JSON", async () => {
  const result = await service(extraction()).parse(conversation);
  assert.equal(result.status, "READY");
  assert.deepEqual(result.request, sample);
  assert.deepEqual(result.questions, []);
  assert.equal(result.plan, null);
  assert.ok(!result.request.requiredCategories.some((entry) => entry.category === "laptop"));
});

test("missing essentials and uncertain quantities ask questions without calling the catalog", async () => {
  const result = await service(extraction({
    budgetINR: null, maxDeliveryDays: null,
    requiredCategories: [{ category: "monitor", quantity: null }], hardConstraints: {},
  }), { catalogProvider: { listProducts() { assert.fail("Must not optimize an incomplete request"); } } }).plan(conversation);
  assert.equal(result.status, "NEEDS_CLARIFICATION");
  assert.equal(result.request, null);
  assert.equal(result.plan, null);
  for (const field of ["budgetINR", "maxDeliveryDays", "requiredCategories[0].quantity"]) {
    assert.ok(result.questions.some((entry) => entry.field === field));
  }
  const empty = await service(extraction({ requiredCategories: [], hardConstraints: {} })).parse(conversation);
  assert.ok(empty.questions.some((entry) => entry.field === "requiredCategories"));
});

test("follow-ups re-extract the full conversation, preserving constraints and applying explicit corrections", async () => {
  const messages = ["I need two 144 Hz monitors under 60k.", "Delivery within 7 days. Change budget to 40000."];
  let seen;
  const result = await createAIService({ extract: async (input) => {
    seen = input;
    return extraction({ budgetINR: 40000, requiredCategories: [{ category: "monitor", quantity: 2 }] });
  } }).parse({ requestId: "req_followup", messages });
  assert.deepEqual(seen, messages);
  assert.equal(result.request.budgetINR, 40000);
  assert.equal(result.request.maxDeliveryDays, 7);
  assert.deepEqual(result.request.hardConstraints.monitor, { minRefreshRateHz: 144 });
  assert.equal(result.request.requiredCategories[0].quantity, 2);
  assert.equal(result.request.rawQuery, messages.join("\nFollow-up: "));
});

test("unresolved contradictions and unsupported laptop/RAM constraints block planning", async () => {
  const result = await service(extraction({
    budgetINR: 300000, maxDeliveryDays: 10,
    requiredCategories: [{ category: "laptop", quantity: 5 }], hardConstraints: {},
    unsupportedRequirements: ["Minimum 16 GB RAM for each laptop", "One-year laptop warranty"],
  })).plan({ messages: ["5 laptops, 16GB minimum, under 3 lakh, 10 days and 1 year warranty"] });
  assert.equal(result.status, "NEEDS_CLARIFICATION");
  assert.ok(result.unsupportedRequirements.some((entry) => entry.includes("16 GB")));
  assert.ok(result.unsupportedRequirements.some((entry) => entry.includes("laptop")));
  assert.equal(result.plan, null);
  const ambiguous = await service(extraction({ ambiguities: ["Is 60000 the total or the per-item budget?"] })).plan(conversation);
  assert.equal(ambiguous.status, "NEEDS_CLARIFICATION");
  assert.ok(ambiguous.questions.some((entry) => entry.question.includes("per-item")));
});

test("missing weights use disclosed defaults; invalid weights and amounts require correction", async () => {
  const defaults = await service(extraction({ weights: null })).parse(conversation);
  assert.deepEqual(defaults.request.weights, sample.weights);
  assert.ok(defaults.assumptions.some((entry) => entry.includes("Default scoring weights")));
  for (const change of [
    { budgetINR: -1 }, { budgetINR: 0 }, { budgetINR: 60000.001 },
    { maxDeliveryDays: 366 },
    { weights: { quality: 0.8, reliability: 0.8, delivery: 0.8 } },
    { requiredCategories: [{ category: "monitor", quantity: 0 }] },
    { requiredCategories: [{ category: "monitor", quantity: 101 }] },
    { requiredCategories: [{ category: "monitor", quantity: 1 }, { category: "monitor", quantity: 2 }] },
  ]) {
    const result = await service(extraction(change)).parse(conversation);
    assert.equal(result.status, "NEEDS_CLARIFICATION", JSON.stringify(change));
    assert.equal(result.request, null);
  }
});

test("malformed model output fails closed, including unknown keys and invented prices", async () => {
  for (const draft of [null, [], {}, extraction({ budgetINR: "60000" }),
    extraction({ maxDeliveryDays: 1.5 }), extraction({ items: [{ unitPriceINR: 100 }] }),
    extraction({ ambiguities: [null] }), extraction({ hardConstraints: { monitor: { minRamGB: 16 } } }),
    extraction({ weights: { quality: 1 } }),
    extraction({ ambiguities: Array(21).fill("Which budget?") }),
    extraction({ hardConstraints: { monitor: { minRefreshRateHz: -1 } } }),
  ]) {
    await assert.rejects(service(draft).parse(conversation), { code: "AI_INVALID_OUTPUT" });
  }
});

test("invalid input is rejected before spending an AI call", async () => {
  const api = createAIService({ extract() { assert.fail("Invalid input must never reach AI"); } });
  for (const input of [null, [], {}, { messages: [] }, { messages: [""] }, { messages: [42] },
    { messages: ["a".repeat(8001)] }, { messages: Array(21).fill("x") },
    { messages: Array(3).fill("a".repeat(6000)) }, { messages: ["x"], requestId: " " },
    { messages: ["x"], draft: sample }, { messages: ["x"], requestId: "x".repeat(129) },
  ]) await assert.rejects(api.plan(input), { code: "INVALID_AI_REQUEST", statusCode: 400 });
});

test("complete extraction invokes the real optimizer and stores the exact plan without payment", async () => {
  const store = createPlanStore();
  const result = await service(extraction(), {
    catalogProvider: createStaticCatalogProvider(catalog.products, catalog), planStore: store,
  }).plan(conversation);
  assert.equal(result.status, "PLANNED");
  assert.deepEqual(Object.keys(result.plan.strategies), ["CHEAPEST", "BEST_VALUE", "ALTERNATIVE"]);
  assert.equal(result.plan.strategies.CHEAPEST.totalINR, 12292);
  assert.equal(result.plan.strategies.BEST_VALUE.totalINR, 54996);
  assert.equal(result.plan.strategies.ALTERNATIVE.totalINR, 50296);
  assert.deepEqual(store.get(result.plan.planId).plan, result.plan);
  assert.equal(result.recommendation.totalINR, result.plan.strategies.BEST_VALUE.totalINR);
  assert.equal(result.recommendation.verificationLevel, "UNVERIFIED_DEMO_DATA");
  assert.equal(result.recommendation.requiresUserApproval, true);
  assert.ok(result.plan.strategies.BEST_VALUE.items.every((entry) => entry.verification.status === "UNVERIFIED_DEMO_DATA"));
});

test("infeasible budgets return optimizer reasons and no invented recommendation", async () => {
  const result = await service(extraction({ budgetINR: 5000 })).plan(conversation);
  assert.equal(result.status, "INFEASIBLE");
  assert.deepEqual(result.plan.strategies, {});
  assert.ok(result.plan.infeasibility.reasons.length);
  assert.equal(result.recommendation, null);
});

test("global warranty requirements survive handoff; unsupported compatibility cannot be ignored", async () => {
  const hardConstraints = Object.fromEntries(sample.requiredCategories.map(({ category }) => [category, { minWarrantyMonths: 12 }]));
  hardConstraints.monitor.minRefreshRateHz = 144;
  const brief = buildBrief(extraction({ hardConstraints }), conversation);
  assert.deepEqual(brief.request.hardConstraints, hardConstraints);
  const blocked = await service(extraction({ unsupportedRequirements: ["Must work at 144 Hz through my laptop's HDMI port"] })).plan(conversation);
  assert.equal(blocked.plan, null);
  assert.equal(blocked.status, "NEEDS_CLARIFICATION");
});

test("extraction prompt contains explicit conversion, ownership and unsupported-constraint policies", () => {
  // These are prompt-policy checks, not claims about a live model's accuracy.
  for (const policy of ["3 lakh=300000", "already-owned", "latest explicit correction wins", "never guess a number", "Never drop RAM", "Price has no weight"]) {
    assert.ok(SYSTEM_INSTRUCTION.includes(policy), policy);
  }
});

test("canonical output normalizes category names before frontend handoff", async () => {
  const result = await service(extraction({
    requiredCategories: [{ category: " Monitor ", quantity: 1 }],
    hardConstraints: { monitor: { minRefreshRateHz: 144 } },
  })).parse(conversation);
  assert.deepEqual(result.request.requiredCategories, [{ category: "monitor", quantity: 1 }]);
  assert.deepEqual(result.request.hardConstraints, { monitor: { minRefreshRateHz: 144 } });
});

test("scope and use-case assumptions do not block an otherwise complete request", async () => {
  const result = await service(extraction({
    assumptions: ["Coding and gaming describe intended use. The four listed items define the complete purchasing scope; the laptop is already owned."],
  })).parse(conversation);
  assert.equal(result.status, "READY");
  assert.deepEqual(result.request, sample);
  assert.deepEqual(result.unsupportedRequirements, []);
  assert.deepEqual(result.questions, []);
});
