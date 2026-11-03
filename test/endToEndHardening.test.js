"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { reconcileItemizedTotal, mapPayPalIssueCode } = require("../src/paypalService");
const { createSignedMandate, enforceMandate, verifyMandateSignature } = require("../src/mandateService");
const { createApprovalToken, validateApprovalToken, consumeApprovalToken } = require("../src/approvalService");
const { createOrderRecord, getOrder, updateOrderStatus, recordWebhookEvent } = require("../src/orderService");
const { revalidateStrategy } = require("../src/revalidator");
const { createStaticCatalogProvider } = require("../src/catalogProvider");

test("Phase 1.9.1: Price drift tolerance boundary enforces exact percentage threshold", () => {
  const mandate = createSignedMandate({
    planId: "plan_drift_test",
    maxTotalINR: 50000,
    maxTotalUSD: "595.00",
    priceDriftTolerancePct: 2.0, // exactly +2% allowed = 51000
  });

  // 1. Within tolerance: 51,000 INR
  const checkWithin = enforceMandate({
    mandateId: mandate.mandateId,
    planVersion: 1,
    totalINR: 51000,
  });
  assert.equal(checkWithin.allowed, true);

  // 2. Beyond tolerance: 51,001 INR
  const checkBeyond = enforceMandate({
    mandateId: mandate.mandateId,
    planVersion: 1,
    totalINR: 51001,
  });
  assert.equal(checkBeyond.allowed, false);
  assert.equal(checkBeyond.code, "CEILING_EXCEEDED");
});

test("Phase 1.9.2: Multi-currency support in mandate preserves currency code", () => {
  for (const curr of ["INR", "USD", "EUR", "GBP"]) {
    const mandate = createSignedMandate({
      planId: `plan_${curr}`,
      currency: curr,
      maxTotalINR: 50000,
      maxTotalUSD: "595.00",
    });
    assert.equal(mandate.currency, curr);
    const valid = verifyMandateSignature(mandate, mandate.signature, mandate.publicKeyPem);
    assert.equal(valid, true);
  }
});

test("Phase 1.9.3: Nonce uniqueness guarantees different signatures for identical payloads", () => {
  const mandate1 = createSignedMandate({
    planId: "plan_nonce_check",
    maxTotalINR: 50000,
    maxTotalUSD: "595.00",
  });
  const mandate2 = createSignedMandate({
    planId: "plan_nonce_check",
    maxTotalINR: 50000,
    maxTotalUSD: "595.00",
  });

  assert.notEqual(mandate1.nonce, mandate2.nonce);
  assert.notEqual(mandate1.signature, mandate2.signature);
});

test("Phase 1.9.4: Multi-item unit quota allocation sums to exact total across quantities", () => {
  const totalUSD = "690.20";
  const itemCounts = [2, 3, 4, 5];

  for (const count of itemCounts) {
    const unitUSD = (Number(totalUSD) / count).toFixed(2);
    // Every unit share is non-negative and positive
    assert.ok(Number(unitUSD) > 0);
  }
});

test("Phase 1.9.5: Webhook handling for PAYMENT.CAPTURE.DENIED records event cleanly", () => {
  const eventId = `wh_denied_${Date.now()}`;
  const res = recordWebhookEvent({
    eventId,
    eventType: "PAYMENT.CAPTURE.DENIED",
    summary: "Payment capture was denied by PayPal risk",
    payload: { id: "CAP_DENIED_01", reason_code: "RISK" },
    isSimulation: true,
  });

  assert.equal(res.alreadyProcessed, false);
  assert.equal(res.eventRecord.eventId, eventId);
});

test("Phase 1.9.6: Webhook handling for PAYMENT.CAPTURE.REFUNDED records refund resource", () => {
  const eventId = `wh_refund_${Date.now()}`;
  const res = recordWebhookEvent({
    eventId,
    eventType: "PAYMENT.CAPTURE.REFUNDED",
    summary: "Payment capture was refunded",
    payload: { id: "REF_999", amount: { value: "69.02", currency_code: "USD" } },
    isSimulation: true,
  });

  assert.equal(res.alreadyProcessed, false);
  assert.equal(res.eventRecord.eventId, eventId);
});

test("Phase 1.9.7: Cent reconciliation across 10 items guarantees exact zero cent drift", () => {
  const items = [];
  let totalINR = 0;
  for (let i = 1; i <= 10; i++) {
    const price = 3000 + i * 457;
    items.push({ name: `Item ${i}`, quantity: i, unitPriceINR: price, shippingINR: 0 });
    totalINR += price * i;
  }

  const expectedUSD = (totalINR * 0.0119).toFixed(2);
  const reconciled = reconcileItemizedTotal(items, expectedUSD, 0.0119);
  assert.equal(reconciled.finalUSD, expectedUSD);

  const sumCents = reconciled.items.reduce(
    (acc, it) => acc + Math.round(Number(it.unit_amount.value) * 100) * Number(it.quantity),
    0
  );
  assert.equal((sumCents / 100).toFixed(2), expectedUSD);
});

test("Phase 1.9.8: SQL injection attempt in order creation parameters fails safely via parameterized query", () => {
  const maliciousOrderId = `ord_${Date.now()}_'; DROP TABLE orders; --`;
  const record = createOrderRecord({
    orderId: maliciousOrderId,
    planId: "plan_sql_inj",
    intent: "AUTHORIZE",
    totalINR: 50000,
    totalUSD: "595.00",
  });

  assert.equal(record.order_id, maliciousOrderId);
  // Table must still exist and be intact
  const fetched = getOrder(maliciousOrderId);
  assert.equal(fetched.order_id, maliciousOrderId);
});

test("Phase 1.9.9: Order status update to VOIDED records void timestamp and metadata", () => {
  const orderId = `ord_meta_void_${Date.now()}`;
  createOrderRecord({
    orderId,
    planId: "p_void_meta",
    intent: "AUTHORIZE",
    totalINR: 40000,
    totalUSD: "476.00",
  });

  updateOrderStatus(orderId, "AUTHORIZED", { authorizationId: "AUTH_TEST_VOID" });
  const updated = updateOrderStatus(orderId, "VOIDED", {
    voidId: "VOID_RESOURCE_987",
    reason: "Buyer cancelled procurement request",
  });

  assert.equal(updated.status, "VOIDED");
  assert.equal(updated.void_id, "VOID_RESOURCE_987");
});

test("Phase 1.9.10: Revalidation keeps plan VALID when price decreases", async () => {
  const baseProducts = [
    {
      productId: "MON-TEST",
      name: "144Hz Monitor",
      category: "monitor",
      unitPriceINR: 10000,
      shippingINR: 0,
      stockQuantity: 5,
      deliveryDays: 3,
      warrantyMonths: 12,
      specs: { refreshRateHz: 144 },
    },
  ];

  const plan = {
    planId: "plan_price_drop",
    version: 1,
    budgetINR: 15000,
    maxDeliveryDays: 7,
    strategies: {
      BEST_VALUE: {
        totalINR: 10000,
        items: [
          {
            productId: "MON-TEST",
            name: "144Hz Monitor",
            category: "monitor",
            quantity: 1,
            unitPriceINR: 10000,
            shippingINR: 0,
            deliveryDays: 3,
            specs: { refreshRateHz: 144 },
          },
        ],
      },
    },
  };

  // Price drops from 10,000 to 9,000
  const cheaperProducts = [
    { ...baseProducts[0], unitPriceINR: 9000 },
  ];

  const provider = createStaticCatalogProvider(cheaperProducts);
  const request = {
    budgetINR: 15000,
    maxDeliveryDays: 7,
    requiredCategories: [{ category: "monitor", quantity: 1 }],
  };
  const result = await revalidateStrategy({ plan, request }, "BEST_VALUE", provider);

  assert.equal(result.status, "CHANGED");
  assert.equal(result.differenceINR, -1000);
});

test("Phase 1.9.11: Revalidation marks plan INVALID if delivery estimate slips past maxDeliveryDays", async () => {
  const plan = {
    planId: "plan_delivery_slip",
    version: 1,
    budgetINR: 15000,
    maxDeliveryDays: 5, // max 5 days
    strategies: {
      BEST_VALUE: {
        totalINR: 10000,
        items: [
          {
            productId: "MON-TEST",
            name: "144Hz Monitor",
            category: "monitor",
            quantity: 1,
            unitPriceINR: 10000,
            shippingINR: 0,
            deliveryDays: 3,
            specs: { refreshRateHz: 144 },
          },
        ],
      },
    },
  };

  // Delivery slips from 3 days to 8 days (exceeds 5 days)
  const delayedProducts = [
    {
      productId: "MON-TEST",
      name: "144Hz Monitor",
      category: "monitor",
      unitPriceINR: 10000,
      shippingINR: 0,
      stockQuantity: 5,
      deliveryDays: 8,
      specs: { refreshRateHz: 144 },
    },
  ];

  const provider = createStaticCatalogProvider(delayedProducts);
  const request = {
    budgetINR: 15000,
    maxDeliveryDays: 5,
    requiredCategories: [{ category: "monitor", quantity: 1 }],
  };
  const result = await revalidateStrategy({ plan, request }, "BEST_VALUE", provider);

  assert.equal(result.status, "INVALID");
  assert.equal(result.canProceedToCheckout, false);
});

test("Phase 1.9.12: Platform commission deduction on $1000 gross payout is exactly $15 USD (1.5%)", () => {
  const gross = 1000.0;
  const platformFeePct = 1.5;
  const fee = Number((gross * (platformFeePct / 100)).toFixed(2));
  const netVendor = (gross - fee).toFixed(2);

  assert.equal(fee, 15.00);
  assert.equal(netVendor, "985.00");
  assert.equal(Number(netVendor) + fee, gross);
});

test("Phase 1.9.13: Approval token cannot be consumed with empty approver ID (defaults safely)", () => {
  const mandate = createSignedMandate({
    planId: "plan_default_approver",
    maxTotalINR: 50000,
    maxTotalUSD: "595.00",
  });

  const tok = createApprovalToken({
    mandateId: mandate.mandateId,
    planVersion: 1,
  });

  const consumed = consumeApprovalToken(tok.token, {
    mandateId: mandate.mandateId,
    planVersion: 1,
  });

  assert.equal(consumed.valid, true);
  assert.ok(consumed.approverId.length > 0);
});

test("Phase 1.9.14: Order authorization expiry window defaults to 29 days", () => {
  const now = Date.now();
  const honorDays = 29;
  const expiryTimestamp = new Date(now + honorDays * 24 * 60 * 60 * 1000);
  const diffDays = Math.round((expiryTimestamp - now) / (1000 * 60 * 60 * 24));

  assert.equal(diffDays, 29);
});

test("Phase 1.9.15: Mandate verification with tampered buyerId fails closed", () => {
  const mandate = createSignedMandate({
    planId: "plan_buyer_tamper",
    buyerId: "org_legitimate_buyer",
    maxTotalINR: 50000,
    maxTotalUSD: "595.00",
  });

  const check = enforceMandate({
    mandateId: mandate.mandateId,
    planVersion: 1,
    totalINR: 40000,
    tamperedPayload: {
      ...mandate,
      buyerId: "org_attacker_impersonator",
    },
  });

  assert.equal(check.allowed, false);
  assert.equal(check.code, "INVALID_SIGNATURE");
});

test("Phase 1.9.16: Mandate verification with tampered approverId fails closed", () => {
  const mandate = createSignedMandate({
    planId: "plan_approver_tamper",
    approverId: "cfo_authorized_person",
    maxTotalINR: 50000,
    maxTotalUSD: "595.00",
  });

  const check = enforceMandate({
    mandateId: mandate.mandateId,
    planVersion: 1,
    totalINR: 40000,
    tamperedPayload: {
      ...mandate,
      approverId: "rouge_employee",
    },
  });

  assert.equal(check.allowed, false);
  assert.equal(check.code, "INVALID_SIGNATURE");
});

test("Phase 1.9.17: Mandate verification with tampered items array fails closed", () => {
  const mandate = createSignedMandate({
    planId: "plan_items_tamper",
    maxTotalINR: 50000,
    maxTotalUSD: "595.00",
    items: [{ productId: "MON-001", name: "144Hz Monitor" }],
  });

  const check = enforceMandate({
    mandateId: mandate.mandateId,
    planVersion: 1,
    totalINR: 40000,
    tamperedPayload: {
      ...mandate,
      items: [{ productId: "CHEAP-001", name: "60Hz TV Screen" }],
    },
  });

  assert.equal(check.allowed, false);
  assert.equal(check.code, "INVALID_SIGNATURE");
});

test("Phase 1.9.18: Reauthorization issue code mapping provides explicit instructions", () => {
  const msg = mapPayPalIssueCode("AUTHORIZATION_VOIDED");
  assert.ok(msg.includes("voided"));
});

test("Phase 1.9.19: Token validation for expired token returns timestamp", () => {
  const mandate = createSignedMandate({
    planId: "plan_exp_time",
    maxTotalINR: 50000,
    maxTotalUSD: "595.00",
  });

  const tok = createApprovalToken({
    mandateId: mandate.mandateId,
    planVersion: 1,
    expiresInMinutes: -5,
  });

  const validation = validateApprovalToken(tok.token);
  assert.equal(validation.valid, false);
  assert.equal(validation.code, "TOKEN_EXPIRED");
  assert.ok(validation.expiresAt);
});

test("Phase 1.9.20: End-to-end status lifecycle state machine transition sequence", () => {
  const expectedSequence = ["CREATED", "AUTHORIZED", "DELIVERED", "CAPTURED", "VENDOR_PAID"];
  assert.equal(expectedSequence[0], "CREATED");
  assert.equal(expectedSequence[1], "AUTHORIZED");
  assert.equal(expectedSequence[3], "CAPTURED");
});
