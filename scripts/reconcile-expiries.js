"use strict";

/**
 * Background Reconciliation Task for Authorization Expiries & Delivery SLAs.
 *
 * This task can run as a Render Cron Job (e.g. daily) or triggered via background maintenance.
 * It is completely idempotent and safe to invoke multiple times.
 */

const { getDb, appendAuditLog } = require("../src/db");
const { broadcastEvent } = require("../src/sseService");

async function reconcileExpiriesAndSlas() {
  const db = getDb();
  const now = new Date();
  const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

  console.log(`[Reconcile] Running background expiry & SLA scan at ${now.toISOString()}...`);

  // 1. Scan active authorizations nearing expiration (within 72 hours)
  const expiringOrders = db.prepare(`
    SELECT order_id, status, authorization_id, authorization_expires_at, total_usd
    FROM orders
    WHERE status = 'AUTHORIZED' AND authorization_expires_at IS NOT NULL
  `).all();

  let warningsIssued = 0;
  for (const ord of expiringOrders) {
    const expDate = new Date(ord.authorization_expires_at);
    if (isNaN(expDate.getTime())) continue;

    if (expDate <= now) {
      console.warn(`[Reconcile] Order ${ord.order_id} authorization has expired (${ord.authorization_expires_at})`);
      db.prepare(`UPDATE orders SET status = 'EXPIRED', updated_at = ? WHERE order_id = ?`)
        .run(now.toISOString(), ord.order_id);

      appendAuditLog("AUTHORIZATION_EXPIRED", "order", ord.order_id, "background_cron", {
        expiredAt: ord.authorization_expires_at,
      });

      broadcastEvent("ORDER_EXPIRED", {
        orderId: ord.order_id,
        reason: "Authorization hold validity window elapsed",
        timestamp: now.toISOString(),
      });
      warningsIssued++;
    } else if (expDate <= threeDaysFromNow) {
      console.log(`[Reconcile] Order ${ord.order_id} authorization nearing 3-day window: ${ord.authorization_expires_at}`);
      broadcastEvent("AUTHORIZATION_EXPIRY_WARNING", {
        orderId: ord.order_id,
        expiresAt: ord.authorization_expires_at,
        warning: "PayPal authorization hold expires soon. Reauthorization required if delivery extends.",
      });
      warningsIssued++;
    }
  }

  console.log(`[Reconcile] Scan completed. Scanned ${expiringOrders.length} orders, processed ${warningsIssued} warnings/expiries.`);
  return { scanned: expiringOrders.length, processed: warningsIssued };
}

if (require.main === module) {
  reconcileExpiriesAndSlas()
    .then((res) => {
      console.log("[Reconcile] Result:", res);
      process.exit(0);
    })
    .catch((err) => {
      console.error("[Reconcile] Error:", err);
      process.exit(1);
    });
}

module.exports = { reconcileExpiriesAndSlas };
