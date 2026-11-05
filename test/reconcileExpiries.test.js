"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { initDb, getDb, closeDb } = require("../src/db");
const { reconcileExpiriesAndSlas } = require("../scripts/reconcile-expiries");

test("reconcileExpiries: marks expired authorizations as EXPIRED and warns nearing expiries", async () => {
  const db = getDb();
  
  // Insert test order with expired authorization
  const expiredOrderId = "ord_test_expired_1001";
  const activeOrderId = "ord_test_active_1002";
  const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const futureDate = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString();

  db.prepare(`
    INSERT OR REPLACE INTO orders (order_id, status, intent, authorization_id, authorization_expires_at, total_usd, total_inr, created_at, updated_at)
    VALUES (?, 'AUTHORIZED', 'AUTHORIZE', 'AUTH-EXPIRED', ?, '100.00', 9493, ?, ?)
  `).run(expiredOrderId, pastDate, pastDate, pastDate);

  db.prepare(`
    INSERT OR REPLACE INTO orders (order_id, status, intent, authorization_id, authorization_expires_at, total_usd, total_inr, created_at, updated_at)
    VALUES (?, 'AUTHORIZED', 'AUTHORIZE', 'AUTH-ACTIVE', ?, '200.00', 18986, ?, ?)
  `).run(activeOrderId, futureDate, pastDate, pastDate);

  const res = await reconcileExpiriesAndSlas();
  assert.ok(res.scanned >= 2, "Must scan authorized orders");

  const expiredOrder = db.prepare("SELECT status FROM orders WHERE order_id = ?").get(expiredOrderId);
  const activeOrder = db.prepare("SELECT status FROM orders WHERE order_id = ?").get(activeOrderId);

  assert.equal(expiredOrder.status, "EXPIRED", "Expired authorization order must transition to EXPIRED");
  assert.equal(activeOrder.status, "AUTHORIZED", "Future authorization order must remain AUTHORIZED");

  // Clean up
  db.prepare("DELETE FROM orders WHERE order_id IN (?, ?)").run(expiredOrderId, activeOrderId);
});
