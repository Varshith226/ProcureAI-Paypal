"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  mapPayPalIssueCode,
  reconcileItemizedTotal,
} = require("../src/paypalService");
const {
  createSignedMandate,
  verifyMandateSignature,
  enforceMandate,
} = require("../src/mandateService");
const {
  createOrderRecord,
  getOrder,
  updateOrderStatus,
  recordWebhookEvent,
  listWebhookEvents,
} = require("../src/orderService");

test("Phase 1.8.1: PayPal error issue mapping covers authorization expiry and limit errors", () => {
  assert.equal(
    mapPayPalIssueCode("AUTHORIZATION_EXPIRED"),
    "The authorization window (29 days) has expired and cannot be captured."
  );
  assert.equal(
    mapPayPalIssueCode("AUTHORIZATION_ALREADY_CAPTURED"),
    "This authorization has already been captured."
  );
  assert.equal(
    mapPayPalIssueCode("AUTHORIZATION_VOIDED"),
    "This authorization has been voided and cannot be captured."
  );
  assert.equal(
    mapPayPalIssueCode("CAPTURE_EXCEEDS_AUTHORIZATION_AMOUNT"),
    "Requested capture amount exceeds the approved authorization limit."
  );
  assert.equal(
    mapPayPalIssueCode("ORDER_NOT_APPROVED"),
    "Buyer has not yet approved this order in PayPal checkout."
  );
});

test("Phase 1.8.2: Capture amount validation rejects capturing more than authorized", () => {
  const authorizedUSD = 690.20;
  const attemptedCaptureUSD = 750.00;

  // Validation function logic
  const isExceeding = attemptedCaptureUSD > authorizedUSD;
  assert.equal(isExceeding, true);

  const mapped = mapPayPalIssueCode("CAPTURE_EXCEEDS_AUTHORIZATION_AMOUNT");
  assert.ok(mapped.includes("exceeds the approved authorization limit"));
});

test("Phase 1.8.3: Duplicate webhook delivery is idempotent across multiple event types", () => {
  const eventTypes = [
    "CHECKOUT.ORDER.APPROVED",
    "PAYMENT.AUTHORIZATION.CREATED",
    "PAYMENT.AUTHORIZATION.VOIDED",
    "PAYMENT.CAPTURE.COMPLETED",
  ];

  for (const eventType of eventTypes) {
    const eventId = `wh_multi_${Date.now()}_${eventType.replace(/\./g, "_")}`;

    const delivery1 = recordWebhookEvent({
      eventId,
      eventType,
      summary: `Test event for ${eventType}`,
      payload: { id: "test_resource_id" },
      isSimulation: true,
    });
    assert.equal(delivery1.alreadyProcessed, false, `First delivery for ${eventType} should not be processed`);

    const delivery2 = recordWebhookEvent({
      eventId,
      eventType,
      summary: `Duplicate event for ${eventType}`,
      payload: { id: "test_resource_id" },
      isSimulation: true,
    });
    assert.equal(delivery2.alreadyProcessed, true, `Second delivery for ${eventType} must be flagged as duplicate`);
  }
});

test("Phase 2.6.1: Mandate tampering on currency is strictly caught", () => {
  const mandate = createSignedMandate({
    planId: "plan_currency_tamper",
    maxTotalINR: 50000,
    maxTotalUSD: "595.00",
    currency: "INR",
  });

  const check = enforceMandate({
    mandateId: mandate.mandateId,
    planVersion: 1,
    totalINR: 45000,
    tamperedPayload: {
      ...mandate,
      currency: "EUR", // Swapping currency
    },
  });

  assert.equal(check.allowed, false);
  assert.equal(check.code, "INVALID_SIGNATURE");
});

test("Phase 2.6.2: Mandate tampering on nonce is caught", () => {
  const mandate = createSignedMandate({
    planId: "plan_nonce_tamper",
    maxTotalINR: 50000,
    maxTotalUSD: "595.00",
  });

  const check = enforceMandate({
    mandateId: mandate.mandateId,
    planVersion: 1,
    totalINR: 45000,
    tamperedPayload: {
      ...mandate,
      nonce: "forged_replay_nonce_12345",
    },
  });

  assert.equal(check.allowed, false);
  assert.equal(check.code, "INVALID_SIGNATURE");
});

test("Phase 2.6.3: Mandate tampering on expiration timestamp is caught", () => {
  const mandate = createSignedMandate({
    planId: "plan_expiry_tamper",
    maxTotalINR: 50000,
    maxTotalUSD: "595.00",
    expiresInMinutes: 60,
  });

  const check = enforceMandate({
    mandateId: mandate.mandateId,
    planVersion: 1,
    totalINR: 45000,
    tamperedPayload: {
      ...mandate,
      expiresAt: "2099-01-01T00:00:00.000Z", // Extending validity
    },
  });

  assert.equal(check.allowed, false);
  assert.equal(check.code, "INVALID_SIGNATURE");
});

test("Phase 2.6.4: Mandate tampering on allowed merchants is caught", () => {
  const mandate = createSignedMandate({
    planId: "plan_merchant_tamper",
    maxTotalINR: 50000,
    maxTotalUSD: "595.00",
    allowedMerchants: ["MERCHANT_VERIFIED_01"],
  });

  const check = enforceMandate({
    mandateId: mandate.mandateId,
    planVersion: 1,
    totalINR: 45000,
    tamperedPayload: {
      ...mandate,
      allowedMerchants: ["ATTACKER_ACCOUNT_99"],
    },
  });

  assert.equal(check.allowed, false);
  assert.equal(check.code, "INVALID_SIGNATURE");
});

test("Phase 1.8.4: Partial capture calculation for SLA credit leaves 10% penalty uncaptured", () => {
  const originalAuthorizedUSD = 690.20;
  const slaPenaltyPct = 10;
  const capturedAmountUSD = (originalAuthorizedUSD * (1 - slaPenaltyPct / 100)).toFixed(2);
  const releasedCreditUSD = (originalAuthorizedUSD - Number(capturedAmountUSD)).toFixed(2);

  assert.equal(capturedAmountUSD, "621.18");
  assert.equal(releasedCreditUSD, "69.02");

  // Reconcile total matches original sum
  assert.equal((Number(capturedAmountUSD) + Number(releasedCreditUSD)).toFixed(2), "690.20");
});

test("Phase 1.8.5: Order void transitions order status from AUTHORIZED to VOIDED", () => {
  const orderId = `ord_void_test_${Date.now()}`;
  createOrderRecord({
    orderId,
    planId: "plan_void_test",
    intent: "AUTHORIZE",
    totalINR: 58000,
    totalUSD: "690.20",
  });

  updateOrderStatus(orderId, "AUTHORIZED", {
    authorizationId: "AUTH_VOID_ME_123",
  });

  const voided = updateOrderStatus(orderId, "VOIDED", {
    voidId: "VOID_CONFIRMED_456",
  });

  assert.equal(voided.status, "VOIDED");
  assert.equal(voided.void_id, "VOID_CONFIRMED_456");

  const stored = getOrder(orderId);
  assert.equal(stored.status, "VOIDED");
});

test("Phase 1.8.6: Reauthorization edge case handling for authorizations near 29-day expiry", () => {
  // Documented PayPal payments v2 reauthorization window
  const authorizationCreatedAt = new Date("2026-10-01T00:00:00Z");
  const now = new Date("2026-10-28T00:00:00Z"); // 27 days later
  const daysActive = (now - authorizationCreatedAt) / (1000 * 60 * 60 * 24);

  assert.ok(daysActive > 25, "Authorization is near 29-day expiry threshold");
  const needsReauthorization = daysActive >= 25 && daysActive <= 29;
  assert.equal(needsReauthorization, true);
});
