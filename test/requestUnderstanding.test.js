"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const { understandRequest, clarificationTurn } = require("../src/requestUnderstanding");
const { createAIService } = require("../src/aiService");
const { extraction, condition } = require("./helpers");
const item = (category, quantity = 1, unit = "unit", constraints = []) => ({ category, quantity, unit, required: true, constraints });
const context = { requestId: "req_parser", messages: ["requirements 144 Hz"], referenceDate: "2026-10-30", referenceTime: "2026-10-30T06:00:00Z" };
const parse = (data, messages = context.messages) => understandRequest(data, { ...context, messages });

test("parsing is independent of optimizer and catalog modules", () => {
  const output = execFileSync(process.execPath, ["-e", 'require("./src/aiService");if(Object.keys(require.cache).some(p=>/[/\\\\](planService|catalogProvider|constraintRegistry|requirementsAdapter)\\.js$/.test(p)))process.exit(1);'], { cwd: require("node:path").join(__dirname, "..") });
  assert.equal(output.length, 0);
});

test("arbitrary products, currencies, quantities and attributes are complete when understood", async () => {
  for (const [category, attribute, value] of [["chair", "weightCapacity", 120], ["laptop", "ramGB", 16], ["shirt", "size", "XL"], ["freezer", "temperature", -20], ["project_management_subscription", "seats", 500]]) {
    const data = extraction({ items: [item(category, 500, "unit", [condition(attribute, typeof value === "number" ? "gte" : "eq", value, "requirements")])], budget: { amount: 250, currency: "USD", scope: "PER_ITEM", includesTax: true }, delivery: { maxDays: 500, destination: "Delhi" } });
    const api = createAIService({ extract: async () => data, catalogProvider: { listProducts() { assert.fail("Parser must not inspect catalog"); } } });
    const result = await api.parse({ messages: ["requirements"] });
    assert.equal(result.status, "READY");
    assert.deepEqual(result.questions, []);
    assert.deepEqual(result.request.items, data.items);
    assert.equal(result.request.budget.currency, "USD");
    assert.equal(Object.hasOwn(result, "unsupportedRequirements"), false);
  }
});

test("fractional physical quantities, fine currency precision and sub-day deadlines are preserved", () => {
  const data = extraction({ items: [item("rice", .5, "kg")], budget: { amount: .0001, currency: "BTC" }, delivery: { maxDays: 1.5 } });
  const result = parse(data);
  assert.equal(result.status, "READY");
  assert.equal(result.request.items[0].quantity, .5);
  assert.equal(result.request.budget.amount, .0001);
  assert.equal(result.request.delivery.maxDays, 1.5);
});

test("explicit flexibility needs no fabricated budget or delivery horizon", () => {
  const result = parse(extraction({ budget: { amount: null, currency: null, scope: "UNKNOWN", unlimited: true }, delivery: { maxDays: null, unrestricted: true } }));
  assert.equal(result.status, "READY");
  assert.equal(result.request.budget.amount, null);
  assert.equal(result.request.delivery.maxDays, null);
  assert.equal(result.request.weights.quality, .45); // explicitly injected weights are retained
});

test("missing essentials produce targeted questions, not repeated currency questions", () => {
  const result = parse(extraction({ items: [], budget: { amount: null, currency: null }, delivery: { maxDays: null } }));
  assert.equal(result.status, "NEEDS_CLARIFICATION");
  assert.deepEqual(result.questions.map((q) => q.field), ["budget.amount", "delivery", "items"]);
  assert.equal(result.request, null);
  const currency = parse(extraction({ budget: { amount: 20000, currency: null } }));
  assert.deepEqual(currency.questions.map((q) => q.field), ["budget.currency"]);
});

test("unknown plural quantities and missing units ask only the unresolved detail", () => {
  const plural = parse(extraction({ items: [item("chair", null)] }));
  assert.deepEqual(plural.questions.map((q) => q.field), ["items[0].quantity"]);
  const milk = parse(extraction({ items: [item("milk", 5, null)] }));
  assert.deepEqual(milk.questions.map((q) => q.field), ["items[0].unit"]);
});

test("fitted clothing requires size once, including explicit flexible answers", () => {
  const missing = parse(extraction({ items: [item("shirt", 2)] }));
  assert.equal(missing.status, "NEEDS_CLARIFICATION");
  assert.equal(missing.nextQuestion.field, "items[0].size");
  for (const size of ["XL", "any"]) {
    const result = parse(extraction({ items: [item("shirt", 2, "unit", [condition("size", "eq", size, "requirements")])] }));
    assert.equal(result.status, "READY");
    assert.equal(result.nextQuestion, null);
  }
});

test("purchase-critical replacement identity and software purpose prompt only while missing", () => {
  assert.equal(parse(extraction({ items: [item("printer_cartridge", 2)] })).nextQuestion.field, "items[0].model");
  assert.equal(parse(extraction({ items: [item("software_subscription")] })).nextQuestion.field, "items[0].purpose");
  for (const [category, attribute, value] of [["printer_cartridge", "compatiblePrinterModel", "HP 305"], ["software_subscription", "purpose", "project management"]]) {
    assert.equal(parse(extraction({ items: [item(category, 1, "unit", [condition(attribute, "eq", value, "requirements")])] })).status, "READY");
  }
});

test("qualitative requirements cannot silently become fabricated numeric thresholds", () => {
  const result = parse(extraction({ items: [item("monitor", 1, "unit", [condition("refreshRateHz", "gt", 60, "high refresh rate", "Hz")])] }), ["high refresh rate"]);
  assert.equal(result.status, "NEEDS_CLARIFICATION");
  assert.equal(result.requirements.items[0].constraints[0].value, "high refresh rate");
  assert.equal(result.requirements.items[0].constraints[0].operator, "contains");
  const answered = parse(extraction({ items: [item("monitor", 1, "unit", [condition("refreshRateHz", "gte", 165, "165 Hz", "Hz")])] }), ["high refresh rate", "165 Hz"]);
  assert.equal(answered.status, "READY");
  const preferred = parse(extraction({ items: [item("mouse", 1, "unit", [condition("weightGrams", "lte", 50, "prefer lightweight", "g", "SOFT")])] }), ["prefer lightweight"]);
  assert.equal(preferred.status, "READY");
  assert.equal(preferred.request.items[0].constraints[0].value, "prefer lightweight");
});

test("ranges, conditional and optional purchases stay structured without engine-related questions", () => {
  const optional = item("keyboard"); optional.required = false;
  const result = parse(extraction({ items: [item("chair", null, "unit", [condition("quantity", "between", [5, 10], "requirements")]), optional], globalConstraints: [condition("purchaseCondition", "contains", "if discounted", "requirements")] }));
  assert.equal(result.status, "READY");
  assert.equal(result.request.items[1].required, false);
  assert.deepEqual(result.questions, []);
});

test("strict inequalities, cross-unit contradictions and excluded equality are checked correctly", () => {
  for (const conditions of [
    [condition("size", "gt", 24, "requirements", "inches"), condition("size", "lte", 24, "requirements", "inches")],
    [condition("warranty", "gte", 2, "requirements", "years"), condition("warranty", "lte", 12, "requirements", "months")],
    [condition("brand", "eq", "Acme", "requirements"), condition("brand", "not_in", ["ACME"], "requirements")],
  ]) assert.equal(parse(extraction({ items: [item("anything", 1, "unit", conditions)] })).status, "NEEDS_CLARIFICATION");
  const strict = parse(extraction({ items: [item("monitor", 1, "unit", [condition("refreshRateHz", "gt", 144, "requirements", "Hz")])] }));
  assert.equal(strict.status, "READY");
  assert.equal(strict.request.items[0].constraints[0].operator, "gt");
});

test("all simultaneous conflicting conditions are retained while asking for clarification", () => {
  const conditions = [condition("capacity", "gte", 500, "requirements", "GB"), condition("capacity", "lte", 256, "requirements", "GB")];
  const result = parse(extraction({ items: [item("drive", 1, "unit", conditions)] }));
  assert.equal(result.status, "NEEDS_CLARIFICATION");
  assert.deepEqual(result.requirements.items[0].constraints, conditions);
  assert.equal(result.request, null);
});

test("invalid values require follow-up without imposing optimizer size limits", () => {
  for (const data of [extraction({ budget: { amount: -1 } }), extraction({ items: [item("chair", 0)] }), extraction({ items: [item("chair", 1.5)] }), extraction({ delivery: { maxDays: -1 } }), extraction({ budget: { amount: 1e20 } })]) assert.equal(parse(data).status, "NEEDS_CLARIFICATION");
  assert.equal(parse(extraction({ items: [item("chair", 50000)], delivery: { maxDays: 1000 } })).status, "READY");
});

test("dates, timestamps and ambiguous/past dates use the reference context", () => {
  assert.equal(parse(extraction({ delivery: { maxDays: null, deadlineISO: "2026-10-31" } })).status, "READY");
  assert.equal(parse(extraction({ delivery: { maxDays: null, deadlineISO: "2026-10-30T18:00:00+05:30" } })).status, "READY");
  for (const deadlineISO of ["2026-02-30", "2026-10-29", "2026-10-30T01:00:00Z", "03/04/2027"]) assert.equal(parse(extraction({ delivery: { maxDays: null, deadlineISO } })).status, "NEEDS_CLARIFICATION");
});

test("non-shopping and cancellation never invent budget/quantity questions", () => {
  for (const [intent, status] of [["NON_PROCUREMENT", "NOT_PROCUREMENT"], ["CANCEL", "CANCELLED"]]) {
    const result = parse(extraction({ intent }));
    assert.equal(result.status, status);
    assert.deepEqual(result.questions, []);
    assert.deepEqual(result.requirements.items, []);
    assert.equal(result.request, null);
  }
});

test("short answers keep their question context and prior user requirements", () => {
  const messages = ["I need chairs", clarificationTurn({ field: "items[0].quantity", question: "How many chairs do you need?" }, "5")];
  assert.match(messages[1], /How many chairs.*\nMy answer: 5/);
  assert.throws(() => clarificationTurn({ field: "quantity", question: "How many?" }, " "));
});

test("long clarification conversations are accepted within the total size bound", async () => {
  const messages = ["requirements 144 Hz", ...Array(99).fill("Keep the stated requirements unchanged.")];
  const api = createAIService({ extract: async () => extraction() });
  assert.equal((await api.parse({ messages })).status, "READY");
  await assert.rejects(api.parse({ messages: [...messages, "extra"] }), { code: "INVALID_AI_REQUEST" });
});

test("hallucinated quotes, wrong operators and unsafe categories fail clearly", () => {
  assert.equal(parse(extraction({ items: [item("chair", 1, "unit", [condition("height", "gte", 20, "not stated")])] })).status, "NEEDS_CLARIFICATION");
  assert.throws(() => parse(extraction({ items: [item("chair", 1, "unit", [{ ...condition("height", "gte", 20, "requirements"), operator: "exec" }])] })), { code: "AI_INVALID_OUTPUT" });
  assert.equal(parse(extraction({ items: [item("__proto__")] })).status, "NEEDS_CLARIFICATION");
});
