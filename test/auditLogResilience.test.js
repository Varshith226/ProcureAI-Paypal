"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { getDb, appendAuditLog, verifyAuditLogIntegrity } = require("../src/db");

test("Phase 4.1: Cryptographic hash chain maintains unbroken continuity across sequence of events", () => {
  const initialIntegrity = verifyAuditLogIntegrity();
  assert.equal(initialIntegrity.valid, true);

  const initialCount = initialIntegrity.count;

  // Append 10 sequential audit events
  for (let i = 1; i <= 10; i++) {
    appendAuditLog("TEST_EVENT_STEP", "test_item", `item_${i}`, "test_runner", {
      step: i,
      timestamp: new Date().toISOString(),
      payload: `hash_continuity_check_${i}`,
    });
  }

  const postIntegrity = verifyAuditLogIntegrity();
  assert.equal(postIntegrity.valid, true);
  assert.ok(postIntegrity.count >= initialCount + 10);
});

test("Phase 4.2: Direct tampering of historical audit entry breaks hash chain verification", () => {
  const db = getDb();

  // Create a specific row to tamper with
  appendAuditLog("PAYMENT_TAMPER_TARGET", "order", "ord_tamper_99", "admin", {
    amount: 50000,
    legitimate: true,
  });

  // Verify before tampering
  const before = verifyAuditLogIntegrity();
  assert.equal(before.valid, true);

  // Directly tamper with metadata_json in SQLite
  const row = db.prepare("SELECT sequence_no, metadata_json FROM audit_log WHERE entity_id = 'ord_tamper_99' LIMIT 1").get();
  assert.ok(row);
  const origMetadata = row.metadata_json;

  db.prepare("UPDATE audit_log SET metadata_json = ? WHERE sequence_no = ?").run(
    JSON.stringify({ amount: 999999, legitimate: false }),
    row.sequence_no
  );

  // Verification must now FAIL
  const afterTamper = verifyAuditLogIntegrity();
  assert.equal(afterTamper.valid, false);
  assert.equal(afterTamper.brokenSequence, row.sequence_no);
  assert.equal(afterTamper.reason, "current_hash mismatch");

  // Restore row so subsequent tests pass cleanly
  db.prepare("UPDATE audit_log SET metadata_json = ? WHERE sequence_no = ?").run(
    origMetadata,
    row.sequence_no
  );

  const restored = verifyAuditLogIntegrity();
  assert.equal(restored.valid, true);
});
