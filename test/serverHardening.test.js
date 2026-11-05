"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const app = require("../server");

test("serverHardening: GET /api/health exposes rich diagnostics without credentials", async () => {
  const server = app.listen(0);
  const port = server.address().port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/health`);
    assert.equal(res.status, 200);
    const data = await res.json();

    assert.equal(data.status, "ok");
    assert.equal(data.version, "2.5.0");
    assert.ok(data.nodeVersion);
    assert.ok(data.database);
    assert.equal(data.database.ok, true);
    assert.equal(typeof data.database.persistent, "boolean");
    assert.ok(data.database.path);
    assert.ok(["SANDBOX", "SIMULATED"].includes(data.paypalMode));
    assert.ok(["LIVE", "HEURISTIC"].includes(data.geminiMode));
    assert.ok(data.fx);
    assert.ok(typeof data.uptime === "number");

    // Strict security check: zero secret keys in response payload
    const serialized = JSON.stringify(data);
    assert.equal(serialized.includes("secret"), false, "Payload must not contain 'secret'");
    assert.equal(serialized.includes("key"), false, "Payload must not contain raw 'key'");
  } finally {
    server.close();
  }
});

test("serverHardening: POST /api/demo/reset enforces DEMO_RESET_KEY when set", async () => {
  const server = app.listen(0);
  const port = server.address().port;

  process.env.DEMO_RESET_KEY = "super-secret-demo-key-1042";

  try {
    // 1. Without key -> 401
    const unauthRes = await fetch(`http://127.0.0.1:${port}/api/demo/reset`, { method: "POST" });
    assert.equal(unauthRes.status, 401);
    const unauthData = await unauthRes.json();
    assert.equal(unauthData.error, "INVALID_DEMO_RESET_KEY");

    // 2. With invalid key -> 401
    const badKeyRes = await fetch(`http://127.0.0.1:${port}/api/demo/reset`, {
      method: "POST",
      headers: { "x-demo-reset-key": "wrong-key" },
    });
    assert.equal(badKeyRes.status, 401);

    // 3. With correct key -> 200
    const okRes = await fetch(`http://127.0.0.1:${port}/api/demo/reset`, {
      method: "POST",
      headers: { "x-demo-reset-key": "super-secret-demo-key-1042" },
    });
    assert.equal(okRes.status, 200);
    const okData = await okRes.json();
    assert.equal(okData.ok, true);
  } finally {
    delete process.env.DEMO_RESET_KEY;
    server.close();
  }
});

test("serverHardening: responses include Helmet CSP security headers", async () => {
  const server = app.listen(0);
  const port = server.address().port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/health`);
    assert.equal(res.status, 200);

    const csp = res.headers.get("content-security-policy");
    assert.ok(csp, "Response must include Content-Security-Policy header");
    assert.ok(csp.includes("https://www.paypal.com"), "CSP must permit paypal.com script source");
    assert.ok(res.headers.get("x-content-type-options"), "Response must include X-Content-Type-Options");
  } finally {
    server.close();
  }
});
