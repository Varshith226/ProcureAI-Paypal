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
  nextDraft = {
    budgetINR: sample.budgetINR, maxDeliveryDays: sample.maxDeliveryDays,
    requiredCategories: sample.requiredCategories, hardConstraints: sample.hardConstraints,
    weights: null, assumptions: [], ambiguities: [], unsupportedRequirements: [],
  };
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
  assert.deepEqual((await parsed.json()).request, sample);
  assert.equal(store.size(), 0);
  const planned = await post("/api/ai/plan", body);
  assert.equal(planned.status, 200);
  const result = await planned.json();
  assert.equal(result.status, "PLANNED");
  assert.ok(store.get(result.plan.planId));
  assert.equal(result.plan.strategies.BEST_VALUE.totalINR, 54996);
});

test("AI HTTP clarification returns 200 without planning", async () => {
  nextDraft.budgetINR = null;
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
    assert.deepEqual(Object.keys(status).sort(), ["configured", "model", "provider", "supportedCategories"]);
  } finally { await new Promise((resolve) => mainServer.close(resolve)); }
});

test("frontend helper handles extraction, clarification, real plan and provider errors over HTTP", async () => {
  const messages = [sample.rawQuery];
  const options = { base, requestId: sample.requestId };
  const parsed = await client.parseRequirements(messages, options);
  assert.equal(parsed.status, "READY");
  assert.deepEqual(parsed.request, sample);
  nextDraft.budgetINR = null;
  const incomplete = await client.generatePlanFromMessages(messages, options);
  assert.equal(incomplete.status, "NEEDS_CLARIFICATION");
  assert.equal(incomplete.plan, null);
  nextDraft.budgetINR = 60000;
  const planned = await client.generatePlanFromMessages([...messages, "Keep budget at INR 60000"], options);
  assert.equal(planned.status, "PLANNED");
  assert.equal(planned.plan.strategies.BEST_VALUE.totalINR, 54996);
  nextError = new AIServiceError("AI_RATE_LIMITED", "Try later", 429);
  await assert.rejects(client.generatePlanFromMessages(messages, options), { code: "AI_RATE_LIMITED", status: 429 });
});
