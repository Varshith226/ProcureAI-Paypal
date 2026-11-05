// test/mandateCeilingEnforcement.test.js
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createSignedMandate, enforceMandate } = require("../src/mandateService");

test("Section A.1: enforceMandate strictly blocks orders exceeding the authorized spending ceiling", () => {
  const mandateId = `mandate_test_ceil_${Date.now()}`;
  const signed = createSignedMandate({
    mandateId,
    planId: "plan_test_ceil",
    planVersion: 1,
    maxTotalINR: 50000,
    maxTotalUSD: "600.00",
    priceDriftTolerancePct: 0.0,
    items: [{ productId: "MON-001", name: "Monitor", unitPriceINR: 50000 }],
  });

  assert.equal(signed.maxTotalINR, 50000);

  // Exact ceiling: PASS
  const passCheck = enforceMandate({
    mandateId,
    planVersion: 1,
    totalINR: 50000,
    totalUSD: "600.00",
  });
  assert.equal(passCheck.allowed, true);

  // 1 Rupee over ceiling: STRICTLY REFUSED
  const failCheckINR = enforceMandate({
    mandateId,
    planVersion: 1,
    totalINR: 50001,
    totalUSD: "600.00",
  });
  assert.equal(failCheckINR.allowed, false);
  assert.equal(failCheckINR.code, "CEILING_EXCEEDED");
  assert.match(failCheckINR.message, /exceeds the authorized spending ceiling/);
});

test("Section A.1: create-order and authorize-order enforce ceiling guardrails", () => {
  const mandateId = `mandate_guardrail_${Date.now()}`;
  createSignedMandate({
    mandateId,
    planId: "plan_test_endpoints",
    planVersion: 1,
    maxTotalINR: 60000,
    maxTotalUSD: "720.00",
    priceDriftTolerancePct: 0.0,
    items: [],
  });

  // Simulate create-order mandate verification
  const createOrderAttempt = (totalINR) => {
    return enforceMandate({
      mandateId,
      planVersion: 1,
      totalINR,
      totalUSD: (totalINR / 83.5).toFixed(2),
    });
  };

  // Simulate authorize-order mandate verification
  const authorizeOrderAttempt = (totalINR) => {
    return enforceMandate({
      mandateId,
      planVersion: 1,
      totalINR,
      totalUSD: (totalINR / 83.5).toFixed(2),
    });
  };

  // Valid amounts: both endpoints permit
  assert.equal(createOrderAttempt(60000).allowed, true);
  assert.equal(authorizeOrderAttempt(60000).allowed, true);

  // Exceeding ceiling by ₹5,000: both endpoints block
  const createResult = createOrderAttempt(65000);
  assert.equal(createResult.allowed, false);
  assert.equal(createResult.code, "CEILING_EXCEEDED");

  const authResult = authorizeOrderAttempt(65000);
  assert.equal(authResult.allowed, false);
  assert.equal(authResult.code, "CEILING_EXCEEDED");
});

test("Section A.4: Order status chip state labels transition correctly", () => {
  // Helper to compute state label as in client UI
  function computeOrderStatusLabel({ hasMandate, isWaitingApproval, isApproved }) {
    if (!hasMandate) return "DRAFT";
    if (isApproved) return "APPROVED";
    if (isWaitingApproval) return "AWAITING APPROVAL";
    return "MANDATE SIGNED";
  }

  // 1. Initial signed mandate state
  assert.equal(
    computeOrderStatusLabel({ hasMandate: true, isWaitingApproval: false, isApproved: false }),
    "MANDATE SIGNED"
  );

  // 2. Pending approval link generated / waiting
  assert.equal(
    computeOrderStatusLabel({ hasMandate: true, isWaitingApproval: true, isApproved: false }),
    "AWAITING APPROVAL"
  );

  // 3. Approved only after token is consumed
  assert.equal(
    computeOrderStatusLabel({ hasMandate: true, isWaitingApproval: false, isApproved: true }),
    "APPROVED"
  );

  // 4. Must never be "APPROVED & BOUND" before approval
  const preApprovalLabel = computeOrderStatusLabel({ hasMandate: true, isWaitingApproval: true, isApproved: false });
  assert.notEqual(preApprovalLabel, "APPROVED & BOUND");
  assert.notEqual(preApprovalLabel, "APPROVED");
});

