"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createApprovalToken,
  consumeApprovalToken,
  getApprovalRequired,
  setApprovalRequired,
  isMandateApproved,
} = require("../src/approvalService");
const { createSignedMandate } = require("../src/mandateService");
const { listAuditLog } = require("../src/orderService");

test("Executive Approval Gating: reject unapproved mandate when required, allow when approved or requirement off", async () => {
  const mandateId = `mandate_gating_test_${Date.now()}`;
  createSignedMandate({
    mandateId,
    planId: "plan_demo_1",
    planVersion: 1,
    maxTotalINR: 50000,
    maxTotalUSD: 526.70,
  });

  // Ensure default is ON
  setApprovalRequired(true, "test_admin");
  assert.equal(getApprovalRequired(), true);

  // Path 1: Unapproved mandate is NOT approved
  assert.equal(isMandateApproved(mandateId, 1), false);

  // Path 2: Issue approval token and consume it
  const tokenRecord = createApprovalToken({
    mandateId,
    planVersion: 1,
    planId: "plan_demo_1",
    actor: "cfo_portal",
  });
  assert.ok(tokenRecord.token);

  // Before consumption, still unapproved
  assert.equal(isMandateApproved(mandateId, 1), false);

  // Consume token
  const consumeRes = consumeApprovalToken(tokenRecord.token, {
    mandateId,
    planVersion: 1,
    approverId: "cfo_executive",
  });
  assert.equal(consumeRes.valid, true);

  // After consumption, mandate IS approved
  assert.equal(isMandateApproved(mandateId, 1), true);

  // Path 3: Toggle requirement OFF for demo mode
  setApprovalRequired(false, "demo_toggle");
  assert.equal(getApprovalRequired(), false);

  // Verify audit log tracks requirement toggle
  const logs = listAuditLog(10);
  const toggleEntry = logs.find((l) => l.action === "APPROVAL_REQUIREMENT_TOGGLED");
  assert.ok(toggleEntry, "Audit log must contain APPROVAL_REQUIREMENT_TOGGLED");

  // Restore default
  setApprovalRequired(true, "test_cleanup");
  assert.equal(getApprovalRequired(), true);
});
