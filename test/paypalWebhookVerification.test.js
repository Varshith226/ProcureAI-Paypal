"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { verifyWebhookSignature } = require("../src/paypalService");
const app = require("../server");

test("paypalWebhookVerification: calls PayPal POST /v1/notifications/verify-webhook-signature and handles SUCCESS", async () => {
  const originalFetch = global.fetch;
  let capturedUrl = null;
  let capturedBody = null;

  global.fetch = async (url, options = {}) => {
    capturedUrl = String(url);
    if (capturedUrl.includes("/v1/oauth2/token")) {
      return {
        ok: true,
        json: async () => ({ access_token: "mock_test_token_123", expires_in: 3600 }),
      };
    }
    if (capturedUrl.includes("/v1/notifications/verify-webhook-signature")) {
      capturedBody = JSON.parse(options.body);
      return {
        ok: true,
        json: async () => ({ verification_status: "SUCCESS" }),
      };
    }
    return originalFetch(url, options);
  };

  try {
    const mockPayload = {
      authAlgo: "SHA256withRSA",
      certUrl: "https://api.sandbox.paypal.com/v1/notifications/certs/CERT-123",
      transmissionId: "trans-abc-456",
      transmissionSig: "sig_mock_base64_data",
      transmissionTime: "2026-11-05T12:00:00Z",
      webhookId: "WH-MOCK-789",
      webhookEvent: {
        id: "WH-EVT-1001",
        event_type: "PAYMENT.CAPTURE.COMPLETED",
        summary: "Payment capture completed",
      },
    };

    const res = await verifyWebhookSignature(mockPayload);

    assert.equal(res.verified, true, "Must verify true on SUCCESS");
    assert.equal(res.verificationStatus, "SUCCESS");
    assert.ok(capturedUrl.includes("/v1/notifications/verify-webhook-signature"), "Must call PayPal endpoint");

    // Exact PayPal API payload schema validation
    assert.equal(capturedBody.auth_algo, mockPayload.authAlgo);
    assert.equal(capturedBody.cert_url, mockPayload.certUrl);
    assert.equal(capturedBody.transmission_id, mockPayload.transmissionId);
    assert.equal(capturedBody.transmission_sig, mockPayload.transmissionSig);
    assert.equal(capturedBody.transmission_time, mockPayload.transmissionTime);
    assert.equal(capturedBody.webhook_id, mockPayload.webhookId);
    assert.deepEqual(capturedBody.webhook_event, mockPayload.webhookEvent);
  } finally {
    global.fetch = originalFetch;
  }
});

test("paypalWebhookVerification: rejects when PayPal returns verification_status FAILURE", async () => {
  const originalFetch = global.fetch;

  global.fetch = async (url, options = {}) => {
    const sUrl = String(url);
    if (sUrl.includes("/v1/oauth2/token")) {
      return {
        ok: true,
        json: async () => ({ access_token: "mock_test_token_123", expires_in: 3600 }),
      };
    }
    if (sUrl.includes("/v1/notifications/verify-webhook-signature")) {
      return {
        ok: true,
        json: async () => ({ verification_status: "FAILURE" }),
      };
    }
    return originalFetch(url, options);
  };

  try {
    const res = await verifyWebhookSignature({
      authAlgo: "SHA256withRSA",
      certUrl: "https://api.sandbox.paypal.com/certs/fake",
      transmissionId: "trans-tampered",
      transmissionSig: "sig_tampered",
      transmissionTime: "2026-11-05T12:00:00Z",
      webhookId: "WH-MOCK-789",
      webhookEvent: { id: "WH-EVT-TAMPERED", event_type: "CHECKOUT.ORDER.APPROVED" },
    });

    assert.equal(res.verified, false, "Must verify false on FAILURE");
    assert.equal(res.verificationStatus, "FAILURE");
  } finally {
    global.fetch = originalFetch;
  }
});

test("paypalWebhookVerification: router returns 400 when PayPal verification fails", async () => {
  const originalFetch = global.fetch;
  process.env.PAYPAL_WEBHOOK_ID = "WH-MOCK-789";

  global.fetch = async (url, options = {}) => {
    const sUrl = String(url);
    if (sUrl.includes("/v1/oauth2/token")) {
      return {
        ok: true,
        json: async () => ({ access_token: "mock_test_token_123", expires_in: 3600 }),
      };
    }
    if (sUrl.includes("/v1/notifications/verify-webhook-signature")) {
      return {
        ok: true,
        json: async () => ({ verification_status: "FAILURE" }),
      };
    }
    return originalFetch(url, options);
  };

  const server = app.listen(0);
  const port = server.address().port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/paypal/webhook`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "paypal-auth-algo": "SHA256withRSA",
        "paypal-cert-url": "https://api.sandbox.paypal.com/certs/cert",
        "paypal-transmission-id": "trans-1",
        "paypal-transmission-sig": "sig-bad",
        "paypal-transmission-time": new Date().toISOString(),
      },
      body: JSON.stringify({
        id: "evt_test_fail",
        event_type: "PAYMENT.CAPTURE.COMPLETED",
      }),
    });

    assert.equal(res.status, 400, "Must return HTTP 400 when signature fails");
    const data = await res.json();
    assert.equal(data.error, "Webhook signature verification failed");
  } finally {
    server.close();
    global.fetch = originalFetch;
    delete process.env.PAYPAL_WEBHOOK_ID;
  }
});

