"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { aiRateLimiter, resetRateLimits, isGlobalAICeilingReached } = require("../src/rateLimiter");

test("rateLimiter: enforces per-minute threshold on AI prompts and returns 429", () => {
  resetRateLimits();
  process.env.RATE_LIMIT_AI_PER_MIN = "5";

  let lastStatus = 200;
  let lastJson = null;
  let headers = {};

  const req = { ip: "192.168.1.100" };
  const createRes = () => ({
    set(key, val) { headers[key] = val; },
    status(code) { lastStatus = code; return this; },
    json(data) { lastJson = data; return this; },
  });

  // First 5 requests should pass
  for (let i = 0; i < 5; i++) {
    let nextCalled = false;
    aiRateLimiter(req, createRes(), () => { nextCalled = true; });
    assert.equal(nextCalled, true, `Request ${i + 1} should pass`);
  }

  // 6th request should be blocked with 429
  let nextCalled = false;
  aiRateLimiter(req, createRes(), () => { nextCalled = true; });
  assert.equal(nextCalled, false, "6th request must not call next()");
  assert.equal(lastStatus, 429, "Must return status 429");
  assert.equal(lastJson.error, "RATE_LIMIT_EXCEEDED");
  assert.ok(headers["Retry-After"], "Must return Retry-After header");

  resetRateLimits();
  delete process.env.RATE_LIMIT_AI_PER_MIN;
});
