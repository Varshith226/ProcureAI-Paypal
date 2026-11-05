"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { getDb } = require("../src/db");
const { reconcileExpiriesAndSlas } = require("../scripts/reconcile-expiries");

test("reconcileExpiries: marks orders past 29 days as EXPIRED, but after 72 hours keeps status AUTHORIZED with honor ended warning", async () => {
  const db = getDb();
  
  const orderPast29Days = "ord_test_29days_1001";
  const orderPast72Hours = "ord_test_72hours_1002";
  const orderFresh = "ord_test_fresh_1003";

  const now = Date.now();
  const datePast30Days = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();
  const datePast4Days = new Date(now - 4 * 24 * 60 * 60 * 1000).toISOString(); // > 72 hours, < 29 days
  const dateFresh = new Date(now - 2 * 60 * 60 * 1000).toISOString(); // 2 hours old

  db.prepare(`
    INSERT OR REPLACE INTO orders (order_id, status, intent, authorization_id, authorization_expires_at, total_usd, total_inr, created_at, updated_at)
    VALUES (?, 'AUTHORIZED', 'AUTHORIZE', 'AUTH-29D', ?, '100.00', 9493, ?, ?)
  `).run(orderPast29Days, datePast30Days, datePast30Days, datePast30Days);

  db.prepare(`
    INSERT OR REPLACE INTO orders (order_id, status, intent, authorization_id, authorization_expires_at, total_usd, total_inr, created_at, updated_at)
    VALUES (?, 'AUTHORIZED', 'AUTHORIZE', 'AUTH-72H', ?, '150.00', 14239, ?, ?)
  `).run(orderPast72Hours, new Date(now + 20 * 24 * 60 * 60 * 1000).toISOString(), datePast4Days, datePast4Days);

  db.prepare(`
    INSERT OR REPLACE INTO orders (order_id, status, intent, authorization_id, authorization_expires_at, total_usd, total_inr, created_at, updated_at)
    VALUES (?, 'AUTHORIZED', 'AUTHORIZE', 'AUTH-FRESH', ?, '200.00', 18986, ?, ?)
  `).run(orderFresh, new Date(now + 28 * 24 * 60 * 60 * 1000).toISOString(), dateFresh, dateFresh);

  const res = await reconcileExpiriesAndSlas();
  assert.ok(res.scanned >= 3, "Must scan active authorized orders");

  const dbOrder29Days = db.prepare("SELECT status FROM orders WHERE order_id = ?").get(orderPast29Days);
  const dbOrder72Hours = db.prepare("SELECT status FROM orders WHERE order_id = ?").get(orderPast72Hours);
  const dbOrderFresh = db.prepare("SELECT status FROM orders WHERE order_id = ?").get(orderFresh);

  // Semantics verification:
  // 1. Order >= 29 days must be marked EXPIRED
  assert.equal(dbOrder29Days.status, "EXPIRED", "Order past 29 days must be marked EXPIRED");

  // 2. Order past 72 hours MUST STAY AUTHORIZED
  assert.equal(dbOrder72Hours.status, "AUTHORIZED", "Order past 72 hours must stay AUTHORIZED");

  // 3. Fresh order stays AUTHORIZED
  assert.equal(dbOrderFresh.status, "AUTHORIZED", "Fresh order must stay AUTHORIZED");

  // 4. Verify audit log entry for honor period ended
  const auditRow = db.prepare(`
    SELECT * FROM audit_log
    WHERE entity_id = ? AND action = 'AUTHORIZATION_HONOR_PERIOD_ENDED'
  `).get(orderPast72Hours);
  assert.ok(auditRow, "Audit log must record AUTHORIZATION_HONOR_PERIOD_ENDED");
  assert.ok(auditRow.metadata_json.includes("honor period ended, reauthorize recommended"));

  // Clean up
  db.prepare("DELETE FROM orders WHERE order_id IN (?, ?, ?)").run(orderPast29Days, orderPast72Hours, orderFresh);
  db.prepare("DELETE FROM audit_log WHERE entity_id = ?").run(orderPast72Hours);
});
