"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const contracts = require("../shared/contracts.json");
const { describeSupportedConstraints } = require("../src/constraintRegistry");
const example = require("../examples/response-60k-setup.json");

test("shared/contracts.json lists exactly the constraints the verifier supports", () => {
  const actual = Object.fromEntries(Object.entries(describeSupportedConstraints()).map(([k, v]) => [k, Object.keys(v).sort()]));
  const documented = Object.fromEntries(Object.entries(contracts.supportedHardConstraints).map(([k, v]) => [k, [...v].sort()]));
  assert.deepEqual(documented, actual);
});

test("the committed example response has every documented top-level, strategy and item field", () => {
  const keys = (o) => Object.keys(o).sort();
  assert.deepEqual(keys(example), keys(contracts.ProcurementPlan));
  const bv = example.strategies.BEST_VALUE;
  // tradeOff is ALTERNATIVE-only
  assert.deepEqual(keys(bv), keys(contracts.Strategy).filter((k) => k !== "tradeOff"));
  assert.ok("tradeOff" in example.strategies.ALTERNATIVE);
  assert.deepEqual(keys(bv.items[0]), keys(contracts.Item));
});
