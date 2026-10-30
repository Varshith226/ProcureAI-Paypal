"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createGeminiExtractor } = require("../src/geminiExtractor");
const { EXTRACTION_SCHEMA, GEMINI_EXTRACTION_SCHEMA, schemaErrors } = require("../src/requestExtraction");

function response(text, finishReason = "STOP") {
  return { ok: true, json: async () => ({ candidates: [{ finishReason, content: { parts: [{ text }] } }] }) };
}

test("Gemini adapter sends schema, user-only conversation and key header to the fixed API host", async () => {
  let observed;
  const extract = createGeminiExtractor({ apiKey: "test-private-key", model: "test-model", fetchImpl: async (url, init) => {
    observed = { url, init, body: JSON.parse(init.body) };
    return response('{"budgetINR":60000}');
  } });
  assert.deepEqual(await extract(["Need a monitor", "Budget 60000"]), { budgetINR: 60000 });
  assert.equal(observed.url, "https://generativelanguage.googleapis.com/v1beta/models/test-model:generateContent");
  assert.ok(!observed.url.includes("test-private-key"));
  assert.equal(observed.init.headers["x-goog-api-key"], "test-private-key");
  assert.deepEqual(observed.body.generationConfig.responseJsonSchema, GEMINI_EXTRACTION_SCHEMA);
  assert.notDeepEqual(observed.body.generationConfig.responseJsonSchema, EXTRACTION_SCHEMA);
  assert.deepEqual(JSON.parse(observed.body.contents[0].parts[0].text).userMessages, ["Need a monitor", "Budget 60000"]);
  assert.ok(observed.init.signal instanceof AbortSignal);
});

test("Gemini missing key and invalid model ID fail before network", async () => {
  for (const config of [{ apiKey: "" }, { apiKey: "your-gemini-api-key" }, { apiKey: "test", model: "../../evil" }]) {
    await assert.rejects(createGeminiExtractor({ ...config, fetchImpl() { assert.fail("Must not call network"); } })(["x"]), { code: "AI_NOT_CONFIGURED", statusCode: 503 });
  }
});

test("provider failures are controlled and never expose response bodies or secrets", async () => {
  for (const [status, code, statusCode] of [[429, "AI_RATE_LIMITED", 429], [400, "AI_PROVIDER_ERROR", 502], [401, "AI_PROVIDER_ERROR", 502], [403, "AI_PROVIDER_ERROR", 502], [500, "AI_PROVIDER_ERROR", 502]]) {
    let calls = 0;
    await assert.rejects(createGeminiExtractor({ apiKey: "test", fetchImpl: async () => {
      calls++;
      return { ok: false, status, json() { assert.fail("Error body should not be read"); } };
    }, waitImpl() { assert.fail("Only 503 should trigger backoff"); } })(["x"]), { code, statusCode });
    assert.equal(calls, 1);
  }
  await assert.rejects(createGeminiExtractor({ apiKey: "test", fetchImpl: async () => { throw new Error("secret-text"); } })(["x"]), (error) => {
    assert.equal(error.code, "AI_UNAVAILABLE");
    assert.ok(!error.message.includes("secret-text"));
    return true;
  });
});

test("simplified provider schema preserves structure while local validation still rejects bounds violations", () => {
  function checkShape(local, provider) {
    if (Array.isArray(local)) return local.forEach((value, i) => checkShape(value, provider[i]));
    if (local === null || typeof local !== "object") return assert.deepEqual(provider, local);
    assert.deepEqual(Object.keys(provider), Object.keys(local).filter((key) => !["minimum", "maxItems"].includes(key)));
    for (const [key, value] of Object.entries(provider)) checkShape(local[key], value);
  }
  checkShape(EXTRACTION_SCHEMA, GEMINI_EXTRACTION_SCHEMA);
  assert.equal(EXTRACTION_SCHEMA.properties.ambiguities.maxItems, 30);
  assert.ok(schemaErrors(Array(31).fill("question"), EXTRACTION_SCHEMA.properties.ambiguities).some((message) => message.includes("too many")));
  assert.ok(schemaErrors("BUY_NOW", EXTRACTION_SCHEMA.properties.intent).length);
});

test("503 overload retries at 2, 4 and 8 seconds, then can succeed", async () => {
  let calls = 0;
  let released = 0;
  const waits = [];
  const requests = [];
  const extract = createGeminiExtractor({ apiKey: "test", fetchImpl: async (url, init) => {
    calls++;
    requests.push({ url, body: init.body, signal: init.signal });
    return calls < 4 ? { ok: false, status: 503, body: { async cancel() { released++; } } } : response('{"budgetINR":60000}');
  }, waitImpl: async (ms, signal) => { waits.push(ms); assert.equal(signal, requests[0].signal); } });
  assert.deepEqual(await extract(["budget 60000"]), { budgetINR: 60000 });
  assert.equal(calls, 4);
  assert.equal(released, 3);
  assert.deepEqual(waits, [2000, 4000, 8000]);
  for (const request of requests) assert.deepEqual(request, requests[0]);
});

test("persistent 503 overload stops after four attempts with an actionable 503 error", async () => {
  let calls = 0;
  const waits = [];
  const extract = createGeminiExtractor({ apiKey: "test", fetchImpl: async () => {
    calls++;
    return { ok: false, status: 503 };
  }, waitImpl: async (ms) => { waits.push(ms); } });
  await assert.rejects(extract(["x"]), { code: "AI_OVERLOADED", statusCode: 503 });
  assert.equal(calls, 4);
  assert.deepEqual(waits, [2000, 4000, 8000]);
});

test("the total deadline also aborts a backoff wait without making another request", async () => {
  let calls = 0;
  const extract = createGeminiExtractor({ apiKey: "test", timeoutMs: 5, fetchImpl: async () => {
    calls++;
    return { ok: false, status: 503 };
  } });
  await assert.rejects(extract(["x"]), { code: "AI_TIMEOUT", statusCode: 504 });
  assert.equal(calls, 1);
});

test("blocked, truncated, missing, unreadable and non-JSON AI output fail closed", async () => {
  for (const mockedResponse of [response("{}", "SAFETY"), response("{}", "MAX_TOKENS"), response("not JSON"),
    { ok: true, json: async () => ({ candidates: [] }) },
    { ok: true, json: async () => { throw new SyntaxError("bad"); } },
  ]) await assert.rejects(createGeminiExtractor({ apiKey: "test", fetchImpl: async () => mockedResponse })(["x"]), { code: "AI_INVALID_OUTPUT" });
});

test("slow provider is aborted with a controlled timeout", async () => {
  const extract = createGeminiExtractor({ apiKey: "test", timeoutMs: 5,
    fetchImpl: async (url, { signal }) => new Promise((resolve, reject) => {
      signal.addEventListener("abort", () => reject(new Error("Aborted")), { once: true });
    }),
  });
  await assert.rejects(extract(["x"]), { code: "AI_TIMEOUT", statusCode: 504 });
});
