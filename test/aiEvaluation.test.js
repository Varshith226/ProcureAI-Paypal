"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { checkResult, reusableCase, validateResume } = require("../scripts/evaluate-ai");

test("live evaluation rejects false blockers, lost quantities, and dropped mandatory conditions", () => {
  const ready = { status: "READY", draft: { requiredCategories: [{ category: "monitor", quantity: 1 }] }, questions: [], unsupportedRequirements: [], plan: null };
  const expected = { status: "READY", draft: ready.draft, noUnsupportedRequirements: true };
  checkResult(ready, expected);
  assert.throws(() => checkResult({ ...ready, unsupportedRequirements: ["coding setup"] }, expected), assert.AssertionError);
  assert.throws(() => checkResult(ready, { ...expected, draft: { requiredCategories: [{ category: "monitor", quantity: 2 }] } }), assert.AssertionError);
  assert.throws(() => checkResult(ready, { ...expected, unsupportedPatterns: ["RAM"] }), assert.AssertionError);
  assert.throws(() => checkResult(ready, { ...expected, questionFields: ["budgetINR"] }), assert.AssertionError);
});

test("equivalent category labels do not hide incorrect counts or missing specifications", () => {
  const actual = { status: "ENGINE_SUPPORT_REQUIRED", request: null, plan: null, canOptimize: false, questions: [], unsupportedRequirements: ["voltage"], requirements: { items: [{ category: "cordless_drill", quantity: 2, unit: "unit", constraints: [{ attribute: "voltage", operator: "eq", value: 18, importance: "HARD" }] }], globalConstraints: [] } };
  const expected = { status: "ENGINE_SUPPORT_REQUIRED", itemCounts: { drill: 2 }, categoryAliases: { drill: ["cordless_drill"] }, conditions: [{ attribute: "voltage", value: 18 }] };
  checkResult(actual, expected);
  assert.throws(() => checkResult(actual, { ...expected, itemCounts: { drill: 3 } }), assert.AssertionError);
  assert.throws(() => checkResult(actual, { ...expected, conditions: [{ attribute: "voltage", value: 24 }] }), assert.AssertionError);
});

test("singleton equality/set equivalence retains the value and never weakens numeric thresholds", () => {
  const actual = { status: "READY", questions: [], requirements: { items: [{ category: "monitor", constraints: [{ attribute: "panel", operator: "eq", value: "IPS", importance: "HARD" }] }], globalConstraints: [] } };
  const expected = { status: "READY", conditions: [{ attribute: "panel", operator: "in", value: ["IPS"], importance: "HARD" }] };
  checkResult(actual, expected);
  assert.throws(() => checkResult(actual, { ...expected, conditions: [{ attribute: "panel", operator: "in", value: ["VA"] }] }), assert.AssertionError);
  assert.throws(() => checkResult(actual, { ...expected, conditions: [{ attribute: "panel", operator: "gte", value: "IPS" }] }), assert.AssertionError);
});

test("resume never reuses failed, changed-input or changed-parser results", () => {
  const config = { scope: "REQUEST_INTELLIGENCE", contractVersion: 3, model: "test", promptHash: "p", schemaHash: "s", parserHash: "code" };
  validateResume(config, config);
  for (const key of ["model", "promptHash", "schemaHash", "parserHash"]) assert.throws(() => validateResume({ ...config, [key]: "changed" }, config));
  const entry = { id: "one", messages: ["hello"], expected: { status: "READY" } };
  const actual = { status: "READY", questions: [] };
  const success = { ...entry, passed: true, actual };
  assert.ok(reusableCase({ cases: [success] }, entry));
  assert.equal(reusableCase({ cases: [{ ...success, passed: false }] }, entry), null);
  assert.equal(reusableCase({ cases: [success] }, { ...entry, messages: ["different"] }), null);
  assert.equal(reusableCase({ cases: [success] }, { ...entry, expected: { status: "NEEDS_CLARIFICATION" } }), null);
});
