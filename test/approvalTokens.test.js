"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createApprovalToken,
  validateApprovalToken,
  consumeApprovalToken,
  getApprovalToken,
} = require("../src/approvalService");
const { createSignedMandate } = require("../src/mandateService");

test("Phase 5.1: Create valid single-use approval token bound to mandate and plan version", () => {
  const mandate = createSignedMandate({
    planId: "plan_tok_test_01",
    planVersion: 1,
    maxTotalINR: 50000,
    maxTotalUSD: "595.00",
  });

  const tokenRecord = createApprovalToken({
    mandateId: mandate.mandateId,
    planVersion: 1,
    planId: "plan_tok_test_01",
    expiresInMinutes: 30,
    actor: "founder_lead",
  });

  assert.ok(tokenRecord.token.startsWith("tok_appr_"));
  assert.equal(tokenRecord.mandateId, mandate.mandateId);
  assert.equal(tokenRecord.planVersion, 1);
  assert.equal(tokenRecord.expiresInMinutes, 30);

  const validation = validateApprovalToken(tokenRecord.token, {
    mandateId: mandate.mandateId,
    planVersion: 1,
  });
  assert.equal(validation.valid, true);
  assert.equal(validation.tokenRecord.token, tokenRecord.token);
});

test("Phase 5.2: Token consumption succeeds and marks token consumed", () => {
  const mandate = createSignedMandate({
    planId: "plan_tok_test_02",
    planVersion: 1,
    maxTotalINR: 50000,
    maxTotalUSD: "595.00",
  });

  const tokenRecord = createApprovalToken({
    mandateId: mandate.mandateId,
    planVersion: 1,
    planId: "plan_tok_test_02",
  });

  const consumeRes = consumeApprovalToken(tokenRecord.token, {
    mandateId: mandate.mandateId,
    planVersion: 1,
    approverId: "cfo_jane",
  });

  assert.equal(consumeRes.valid, true);
  assert.equal(consumeRes.success, true);
  assert.equal(consumeRes.approverId, "cfo_jane");

  // Re-validating token shows already used
  const recheck = validateApprovalToken(tokenRecord.token);
  assert.equal(recheck.valid, false);
  assert.equal(recheck.code, "TOKEN_ALREADY_USED");
});

test("Phase 5.3: Reused token is strictly rejected", () => {
  const mandate = createSignedMandate({
    planId: "plan_tok_test_03",
    planVersion: 1,
    maxTotalINR: 50000,
    maxTotalUSD: "595.00",
  });

  const tokenRecord = createApprovalToken({
    mandateId: mandate.mandateId,
    planVersion: 1,
    planId: "plan_tok_test_03",
  });

  // First consumption succeeds
  const first = consumeApprovalToken(tokenRecord.token);
  assert.equal(first.valid, true);

  // Second consumption fails
  const second = consumeApprovalToken(tokenRecord.token);
  assert.equal(second.valid, false);
  assert.equal(second.code, "TOKEN_ALREADY_USED");
  assert.ok(second.message.includes("already consumed"));
});

test("Phase 5.4: Expired token is rejected", () => {
  const mandate = createSignedMandate({
    planId: "plan_tok_test_04",
    planVersion: 1,
    maxTotalINR: 50000,
    maxTotalUSD: "595.00",
  });

  // Token created with negative expiration (already expired)
  const tokenRecord = createApprovalToken({
    mandateId: mandate.mandateId,
    planVersion: 1,
    planId: "plan_tok_test_04",
    expiresInMinutes: -10,
  });

  const validation = validateApprovalToken(tokenRecord.token);
  assert.equal(validation.valid, false);
  assert.equal(validation.code, "TOKEN_EXPIRED");

  const consumeRes = consumeApprovalToken(tokenRecord.token);
  assert.equal(consumeRes.valid, false);
  assert.equal(consumeRes.code, "TOKEN_EXPIRED");
});

test("Phase 5.5: Token bound to another mandate is rejected", () => {
  const mandateA = createSignedMandate({
    planId: "plan_tok_test_05A",
    planVersion: 1,
    maxTotalINR: 50000,
    maxTotalUSD: "595.00",
  });
  const mandateB = createSignedMandate({
    planId: "plan_tok_test_05B",
    planVersion: 1,
    maxTotalINR: 50000,
    maxTotalUSD: "595.00",
  });

  const tokenRecord = createApprovalToken({
    mandateId: mandateA.mandateId,
    planVersion: 1,
    planId: "plan_tok_test_05A",
  });

  // Attempt to use token for mandateB
  const validation = validateApprovalToken(tokenRecord.token, {
    mandateId: mandateB.mandateId,
  });
  assert.equal(validation.valid, false);
  assert.equal(validation.code, "MANDATE_MISMATCH");

  const consumeRes = consumeApprovalToken(tokenRecord.token, {
    mandateId: mandateB.mandateId,
  });
  assert.equal(consumeRes.valid, false);
  assert.equal(consumeRes.code, "MANDATE_MISMATCH");
});

test("Phase 5.6: Token issued for stale plan version is rejected", () => {
  const mandate = createSignedMandate({
    planId: "plan_tok_test_06",
    planVersion: 1,
    maxTotalINR: 50000,
    maxTotalUSD: "595.00",
  });

  // Token issued for v1
  const tokenRecord = createApprovalToken({
    mandateId: mandate.mandateId,
    planVersion: 1,
    planId: "plan_tok_test_06",
  });

  // Retailer price change advances plan to v2
  const validation = validateApprovalToken(tokenRecord.token, {
    planVersion: 2,
  });
  assert.equal(validation.valid, false);
  assert.equal(validation.code, "STALE_PLAN_VERSION");
  assert.ok(validation.message.includes("Re-approval required"));

  const consumeRes = consumeApprovalToken(tokenRecord.token, {
    planVersion: 2,
  });
  assert.equal(consumeRes.valid, false);
  assert.equal(consumeRes.code, "STALE_PLAN_VERSION");
});

test("Phase 5.7: Non-existent token fails closed", () => {
  const validation = validateApprovalToken("tok_appr_does_not_exist_9999");
  assert.equal(validation.valid, false);
  assert.equal(validation.code, "TOKEN_NOT_FOUND");

  const consumeRes = consumeApprovalToken("tok_appr_does_not_exist_9999");
  assert.equal(consumeRes.valid, false);
  assert.equal(consumeRes.code, "TOKEN_NOT_FOUND");
});

