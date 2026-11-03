"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createSignedMandate,
  verifyMandateSignature,
  getMandateById,
  enforceMandate,
  getKeyFingerprint,
} = require("../src/mandateService");
const {
  reconcileItemizedTotal,
  mapPayPalIssueCode,
} = require("../src/paypalService");
const {
  createOrderRecord,
  getOrder,
  updateOrderStatus,
  recordWebhookEvent,
  listWebhookEvents,
  listAuditLog,
} = require("../src/orderService");
const { verifyAuditLogIntegrity } = require("../src/db");

test("Phase 2: Mandate creation, cryptographic signing and fingerprint", () => {
  const mandate = createSignedMandate({
    planId: "plan_test_01",
    planVersion: 1,
    maxTotalINR: 60000,
    maxTotalUSD: "714.00",
    fxRate: 0.0119,
    items: [
      { productId: "MON-002", name: "Acer Monitor", quantity: 1, unitPriceINR: 10149 },
      { productId: "KEY-001", name: "Redragon Keyboard", quantity: 1, unitPriceINR: 2699 },
    ],
  });

  assert.ok(mandate.mandateId.startsWith("mandate_"));
  assert.equal(mandate.planId, "plan_test_01");
  assert.equal(mandate.planVersion, 1);
  assert.equal(mandate.maxTotalINR, 60000);
  assert.ok(mandate.signature.length >= 64);
  assert.ok(mandate.keyFingerprint.length >= 8);
  assert.equal(mandate.keyFingerprint, getKeyFingerprint());

  // Can be retrieved from DB
  const fetched = getMandateById(mandate.mandateId);
  assert.ok(fetched);
  assert.equal(fetched.mandateId, mandate.mandateId);
  assert.equal(fetched.signature, mandate.signature);
});

test("Phase 2: Signature verification passes for intact payload and fails for tampered payload", () => {
  const mandate = createSignedMandate({
    planId: "plan_sec_test",
    maxTotalINR: 50000,
    maxTotalUSD: "595.00",
  });

  // Verify valid intact mandate
  const validCheck = enforceMandate({
    mandateId: mandate.mandateId,
    planVersion: 1,
    totalINR: 48000,
    totalUSD: "571.20",
  });
  assert.equal(validCheck.allowed, true);
  assert.ok(validCheck.mandate);

  // Tamper: hacker tries to inflate spending ceiling in payload
  const tamperedPayload = { ...mandate, maxTotalINR: 999999 };
  const tamperedCheck = enforceMandate({
    mandateId: mandate.mandateId,
    planVersion: 1,
    totalINR: 48000,
    tamperedPayload,
  });
  assert.equal(tamperedCheck.allowed, false);
  assert.equal(tamperedCheck.code, "INVALID_SIGNATURE");
});

test("Phase 2: Enforcement blocks when spending exceeds ceiling", () => {
  const mandate = createSignedMandate({
    planId: "plan_ceiling_test",
    maxTotalINR: 40000,
    maxTotalUSD: "476.00",
    priceDriftTolerancePct: 0,
  });

  const overCeilingCheck = enforceMandate({
    mandateId: mandate.mandateId,
    planVersion: 1,
    totalINR: 40001,
  });
  assert.equal(overCeilingCheck.allowed, false);
  assert.equal(overCeilingCheck.code, "CEILING_EXCEEDED");
  assert.ok(overCeilingCheck.message.includes("exceeds the authorized spending ceiling"));
});

test("Phase 2: Enforcement blocks when plan version is stale (e.g. after price spike)", () => {
  const mandate = createSignedMandate({
    planId: "plan_version_test",
    planVersion: 1,
    maxTotalINR: 50000,
    maxTotalUSD: "595.00",
  });

  // Server updated to v2 after retailer spike, but client attempts checkout on v1 mandate
  const staleCheck = enforceMandate({
    mandateId: mandate.mandateId,
    planVersion: 2,
    totalINR: 45000,
  });
  assert.equal(staleCheck.allowed, false);
  assert.equal(staleCheck.code, "STALE_PLAN_VERSION");
});

test("Phase 2: Enforcement blocks expired mandate", () => {
  const mandate = createSignedMandate({
    planId: "plan_expired_test",
    maxTotalINR: 50000,
    maxTotalUSD: "595.00",
    expiresInMinutes: -10, // Expired 10 minutes ago
  });

  const expiredCheck = enforceMandate({
    mandateId: mandate.mandateId,
    planVersion: 1,
    totalINR: 45000,
  });
  assert.equal(expiredCheck.allowed, false);
  assert.equal(expiredCheck.code, "MANDATE_EXPIRED");
});

test("Phase 2: Enforcement blocks unauthorized merchants", () => {
  const mandate = createSignedMandate({
    planId: "plan_merchant_test",
    maxTotalINR: 50000,
    maxTotalUSD: "595.00",
    allowedMerchants: ["MERCHANT_ACER_OFFICIAL", "MERCHANT_LOGITECH_DIRECT"],
  });

  const unauthorizedCheck = enforceMandate({
    mandateId: mandate.mandateId,
    planVersion: 1,
    totalINR: 45000,
    merchantId: "UNAPPROVED_SHADY_DISTRIBUTOR",
  });
  assert.equal(unauthorizedCheck.allowed, false);
  assert.equal(unauthorizedCheck.code, "UNAUTHORIZED_MERCHANT");

  const authorizedCheck = enforceMandate({
    mandateId: mandate.mandateId,
    planVersion: 1,
    totalINR: 45000,
    merchantId: "MERCHANT_ACER_OFFICIAL",
  });
  assert.equal(authorizedCheck.allowed, true);
});

test("Phase 1: Cent-accurate itemized reconciliation prevents ITEM_TOTAL_MISMATCH", () => {
  const items = [
    { name: "Item A", quantity: 3, unitPriceINR: 10149, shippingINR: 0 },
    { name: "Item B", quantity: 2, unitPriceINR: 2699, shippingINR: 0 },
    { name: "Item C", quantity: 1, unitPriceINR: 1495, shippingINR: 0 },
  ];
  const inrTotal = 3 * 10149 + 2 * 2699 + 1495; // 37340 INR
  const expectedUSD = (inrTotal * 0.0119).toFixed(2); // 444.35 USD

  const reconciled = reconcileItemizedTotal(items, expectedUSD, 0.0119);
  assert.equal(reconciled.finalUSD, expectedUSD);

  // Assert sum of items exactly equals finalUSD down to the cent
  const itemSumCents = reconciled.items.reduce(
    (acc, it) => acc + Math.round(Number(it.unit_amount.value) * 100) * Number(it.quantity),
    0
  );
  assert.equal((itemSumCents / 100).toFixed(2), expectedUSD);
});

test("Phase 1: Human-readable error translation for PayPal issue codes", () => {
  assert.equal(
    mapPayPalIssueCode("ITEM_TOTAL_MISMATCH"),
    "The sum of line items does not equal the order total amount."
  );
  assert.equal(
    mapPayPalIssueCode("AUTHORIZATION_EXPIRED"),
    "The authorization window (29 days) has expired and cannot be captured."
  );
});

test("Phase 1: Order lifecycle transitions and SQLite persistence", () => {
  const orderId = `ord_test_${Date.now()}`;
  const created = createOrderRecord({
    orderId,
    planId: "p_101",
    intent: "AUTHORIZE",
    totalINR: 58000,
    totalUSD: "690.20",
  });

  assert.equal(created.status, "CREATED");
  assert.equal(created.intent, "AUTHORIZE");

  // Transitions to AUTHORIZED
  const authorized = updateOrderStatus(orderId, "AUTHORIZED", {
    authorizationId: "AUTH_SANDBOX_123",
    authorizationExpiresAt: "2026-12-01T00:00:00Z",
  });
  assert.equal(authorized.status, "AUTHORIZED");
  assert.equal(authorized.authorization_id, "AUTH_SANDBOX_123");

  // Transitions to CAPTURED
  const captured = updateOrderStatus(orderId, "CAPTURED", {
    captureId: "CAP_SANDBOX_456",
  });
  assert.equal(captured.status, "CAPTURED");
  assert.equal(captured.capture_id, "CAP_SANDBOX_456");

  // Fetch from store
  const fetched = getOrder(orderId);
  assert.equal(fetched.status, "CAPTURED");
  assert.equal(fetched.authorization_id, "AUTH_SANDBOX_123");
  assert.equal(fetched.capture_id, "CAP_SANDBOX_456");
});

test("Phase 1: Webhook idempotent delivery and simulation", () => {
  const eventId = `wh_evt_${Date.now()}`;
  const firstDelivery = recordWebhookEvent({
    eventId,
    eventType: "PAYMENT.AUTHORIZATION.CREATED",
    summary: "Authorization created",
    payload: { id: "AUTH_789" },
    isSimulation: false,
  });

  assert.equal(firstDelivery.alreadyProcessed, false);

  // Duplicate webhook delivery
  const duplicateDelivery = recordWebhookEvent({
    eventId,
    eventType: "PAYMENT.AUTHORIZATION.CREATED",
    summary: "Authorization created",
    payload: { id: "AUTH_789" },
    isSimulation: false,
  });

  assert.equal(duplicateDelivery.alreadyProcessed, true);

  // List webhooks contains the event
  const events = listWebhookEvents(10);
  assert.ok(events.some((e) => e.eventId === eventId));
});

test("Phase 4: Cryptographic audit log hash chain integrity", () => {
  const audit = listAuditLog(50);
  assert.ok(audit.length > 0);

  const integrity = verifyAuditLogIntegrity();
  assert.equal(integrity.valid, true);
  assert.ok(integrity.count >= audit.length);
});

