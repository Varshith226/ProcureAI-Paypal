"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { createAIRouter, aiJsonErrorHandler } = require("../src/routes/ai");
const { createAIService } = require("../src/aiService");
const { createPlanStore } = require("../src/planStore");
const { AIServiceError } = require("../src/aiErrors");
const sample = require("../examples/request-60k-setup.json");
const { extraction, condition } = require("./helpers");

let server;
let base;
const store = createPlanStore();
let nextDraft;
let nextError;
let client;
let clientTemp;
test.before(async () => {
  clientTemp = fs.mkdtempSync(path.join(os.tmpdir(), "procureai-intake-"));
  const clientPath = path.join(clientTemp, "requestIntelligenceApi.mjs");
  fs.copyFileSync(path.join(__dirname, "..", "docs", "integration", "requestIntelligenceApi.js"), clientPath);
  client = await import(pathToFileURL(clientPath).href);
  const app = express();
  app.use(express.json());
  app.use("/api/ai", createAIRouter({ service: createAIService({ planStore: store, extract: async () => {
    if (nextError) throw nextError;
    return structuredClone(nextDraft);
  } }) }));
  app.use("/api/ai", aiJsonErrorHandler);
  server = await new Promise((resolve) => { const instance = app.listen(0, "127.0.0.1", () => resolve(instance)); });
  base = `http://127.0.0.1:${server.address().port}`;
});
test.beforeEach(() => {
  nextError = null;
  nextDraft = extraction({ weights: null });
  store.clear();
});
test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
  fs.unlinkSync(path.join(clientTemp, "requestIntelligenceApi.mjs"));
  fs.rmdirSync(clientTemp);
});
const post = (path, body) => fetch(base + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: typeof body === "string" ? body : JSON.stringify(body) });

test("AI HTTP parse returns a ready request; plan returns all real baskets and stores them", async () => {
  const body = { messages: [sample.rawQuery], requestId: sample.requestId };
  const parsed = await post("/api/ai/parse", body);
  assert.equal(parsed.status, 200);
  const parsedBody = await parsed.json();
  assert.equal(parsedBody.contractVersion, 3);
  assert.equal(parsedBody.request.budget.amount, 60000);
  assert.equal(parsedBody.request.items.length, 4);
  assert.equal(store.size(), 0);
  const planned = await post("/api/ai/plan", body);
  assert.equal(planned.status, 200);
  const result = await planned.json();
  assert.equal(result.status, "PLANNED");
  assert.ok(store.get(result.plan.planId));
  assert.equal(result.plan.strategies.BEST_VALUE.totalINR, 54996);
});

test("AI HTTP clarification returns 200 without planning", async () => {
  nextDraft.budget.amount = null;
  const result = await (await post("/api/ai/plan", { messages: ["Need a setup"] })).json();
  assert.equal(result.status, "NEEDS_CLARIFICATION");
  assert.equal(result.plan, null);
  assert.equal(store.size(), 0);
});

test("AI HTTP input errors are JSON including malformed and oversized bodies", async () => {
  for (const [body, expectedStatus] of [["{bad", 400], [[], 400], [{}, 400],
    [{ messages: ["x"], draft: sample }, 400], [{ messages: ["x".repeat(110000)] }, 413]]) {
    const result = await post("/api/ai/plan", body);
    assert.equal(result.status, expectedStatus);
    assert.equal((await result.json()).error, "INVALID_AI_REQUEST");
  }
  const noJson = await fetch(base + "/api/ai/parse", { method: "POST", body: "text" });
  assert.equal(noJson.status, 400);
  assert.equal((await noJson.json()).error, "INVALID_AI_REQUEST");
});

test("AI HTTP provider errors remain actionable and do not become fake plans", async () => {
  nextError = new AIServiceError("AI_NOT_CONFIGURED", "Set GEMINI_API_KEY in .env", 503);
  const result = await post("/api/ai/plan", { messages: ["Need a monitor"] });
  assert.equal(result.status, 503);
  assert.equal((await result.json()).error, "AI_NOT_CONFIGURED");
  assert.equal(store.size(), 0);
});

test("AI routes are mounted in the existing server and expose no key", async () => {
  const app = require("../server");
  const mainServer = await new Promise((resolve) => { const instance = app.listen(0, "127.0.0.1", () => resolve(instance)); });
  try {
    const status = await (await fetch(`http://127.0.0.1:${mainServer.address().port}/api/ai/status`)).json();
    assert.equal(status.provider, "gemini");
    assert.equal(typeof status.configured, "boolean");
    assert.equal(status.contractVersion, 3);
    assert.equal(status.parsesAnyCategory, true);
    assert.deepEqual(Object.keys(status).sort(), ["configured", "contractVersion", "model", "parsesAnyCategory", "provider", "scope"]);
  } finally { await new Promise((resolve) => mainServer.close(resolve)); }
});

test("frontend helper handles extraction, clarification, real plan and provider errors over HTTP", async () => {
  const messages = [sample.rawQuery];
  const options = { base, requestId: sample.requestId };
  const parsed = await client.parseRequirements(messages, options);
  assert.equal(parsed.status, "READY");
  assert.equal(parsed.request.budget.amount, 60000);
  assert.equal(parsed.request.items.length, 4);
  nextDraft.budget.amount = null;
  const incomplete = await client.generatePlanFromMessages(messages, options);
  assert.equal(incomplete.status, "NEEDS_CLARIFICATION");
  assert.equal(incomplete.plan, null);
  nextDraft.budget.amount = 60000;
  const planned = await client.generatePlanFromMessages([...messages, "Keep budget at INR 60000"], options);
  assert.equal(planned.status, "PLANNED");
  assert.equal(planned.plan.strategies.BEST_VALUE.totalINR, 54996);
  nextError = new AIServiceError("AI_RATE_LIMITED", "Try later", 429);
  await assert.rejects(client.generatePlanFromMessages(messages, options), { code: "AI_RATE_LIMITED", status: 429 });
});

test("frontend clarification helper labels short answers without mutating earlier user turns", () => {
  const messages = [sample.rawQuery];
  const question = { field: "items[0].quantity", question: "How many monitors do you need?" };
  const followup = client.appendClarificationAnswer(messages, question, "5");
  assert.equal(messages.length, 1);
  assert.equal(followup[0], sample.rawQuery);
  assert.equal(followup[1], require("../src/requestUnderstanding").clarificationTurn(question, "5"));
  assert.throws(() => client.appendClarificationAnswer(messages, question, " "));
});

test("AI HTTP preserves arbitrary attributes and returns engine gaps without inventing plans", async () => {
  nextDraft = extraction({ items: [{ category: "chair", quantity: 4, unit: "unit", required: true, constraints: [condition("weightCapacity", "gte", 120, "must support 120 kg", "kg")] }] });
  const response = await post("/api/ai/plan", { messages: ["4 chairs, INR 60000 total, 7 days, must support 120 kg"] });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.status, "ENGINE_SUPPORT_REQUIRED");
  assert.equal(result.understandingStatus, "READY");
  assert.equal(result.requirements.items[0].constraints[0].value, 120);
  assert.equal(result.request, null);
  assert.equal(result.plan, null);
  assert.deepEqual(result.questions, []);
  assert.equal(store.size(), 0);
});

test("AI contract endpoint exposes the general schema and all outcome statuses", async () => {
  const contract = await (await fetch(base + "/api/ai/contract")).json();
  assert.equal(contract.contractVersion, 3);
  assert.deepEqual(contract.statuses, ["READY", "NEEDS_CLARIFICATION", "NOT_PROCUREMENT", "CANCELLED"]);
  assert.deepEqual(contract.requirementsSchema, require("../src/requestExtraction").EXTRACTION_SCHEMA);
  const completedSchema = require("../shared/request-intelligence.schema.json");
  assert.deepEqual(contract.completedRequestSchema, completedSchema);
  const { requestId, rawQuery, ...properties } = completedSchema.properties;
  const expected = JSON.parse(JSON.stringify(require("../src/requestExtraction").EXTRACTION_SCHEMA.properties));
  expected.intent.enum = ["PROCUREMENT"];
  expected.ambiguities.maxItems = 0;
  assert.deepEqual(properties, expected);
  assert.equal(requestId.maxLength, 128);
  assert.ok(rawQuery.maxLength >= 16000);
});

test("parse endpoint marks arbitrary clear requirements ready without consulting optimizer support", async () => {
  nextDraft = extraction({ budget: { currency: "USD", amount: 250, scope: "PER_ITEM" }, items: [{ category: "chair", quantity: 500, unit: "unit", required: true, constraints: [condition("weightCapacity", "gte", 120, "120 kg capacity", "kg")] }], delivery: { maxDays: 500, destination: "Delhi" } });
  const response = await post("/api/ai/parse", { messages: ["500 chairs, 120 kg capacity, USD 250 each, deliver to Delhi within 500 days"] });
  const result = await response.json();
  assert.equal(result.status, "READY");
  assert.equal(result.request.items[0].quantity, 500);
  assert.equal(result.request.budget.scope, "PER_ITEM");
  assert.deepEqual(result.questions, []);
  assert.equal(Object.hasOwn(result, "unsupportedRequirements"), false);
  assert.equal(store.size(), 0);
});
