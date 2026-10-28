"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { checkResult } = require("../scripts/evaluate-ai");

test("live evaluation rejects false blockers, lost quantities, and dropped mandatory conditions", () => {
  const ready = { status: "READY", draft: { requiredCategories: [{ category: "monitor", quantity: 1 }] }, questions: [], unsupportedRequirements: [], plan: null };
  const expected = { status: "READY", draft: ready.draft, noUnsupportedRequirements: true };
  checkResult(ready, expected);
  assert.throws(() => checkResult({ ...ready, unsupportedRequirements: ["coding setup"] }, expected), assert.AssertionError);
  assert.throws(() => checkResult(ready, { ...expected, draft: { requiredCategories: [{ category: "monitor", quantity: 2 }] } }), assert.AssertionError);
  assert.throws(() => checkResult(ready, { ...expected, unsupportedPatterns: ["RAM"] }), assert.AssertionError);
  assert.throws(() => checkResult(ready, { ...expected, questionFields: ["budgetINR"] }), assert.AssertionError);
});
