"use strict";

/**
 * In-Process Background Reconciliation for PayPal Authorization Holds & Expiries.
 *
 * Runs inside the Express web service process every 10 minutes via an in-memory timer.
 * Idempotent and strictly guarded against overlapping runs.
 *
 * Semantics:
 *  - 0 to 72 hours: Standard honor period (funds guaranteed by PayPal).
 *  - After 72 hours (3 days): Honor period ended. Status STAYS 'AUTHORIZED', but emits
 *    "honor period ended, reauthorize recommended".
 *  - At 29 days (29 * 24h): Authorization hold expires permanently. Status marked 'EXPIRED'.
 */

const { getDb, appendAuditLog } = require("../src/db");
const { broadcastEvent } = require("../src/sseService");

let isReconciling = false;

async function reconcileExpiriesAndSlas() {
  if (isReconciling) {
    console.log("[Reconcile] Scan already in progress; skipping overlapping run.");
    return { skipped: true };
  }

  isReconciling = true;
  const now = new Date();

  try {
    const db = getDb();

    // Fetch all active authorizations
    const activeOrders = db.prepare(`
      SELECT order_id, status, authorization_id, authorization_expires_at, created_at, updated_at
      FROM orders
      WHERE status = 'AUTHORIZED' AND authorization_id IS NOT NULL
    `).all();

    let processedCount = 0;
    let expiredCount = 0;
    let honorEndedCount = 0;

    const SEVENTY_TWO_HOURS_MS = 72 * 60 * 60 * 1000;
    const TWENTY_NINE_DAYS_MS = 29 * 24 * 60 * 60 * 1000;

    for (const ord of activeOrders) {
      const authCreatedAt = new Date(ord.created_at || ord.updated_at);
      const authExpiresAt = ord.authorization_expires_at ? new Date(ord.authorization_expires_at) : null;

      const elapsedMs = now.getTime() - authCreatedAt.getTime();
      const isPast29Days = elapsedMs >= TWENTY_NINE_DAYS_MS;
      const isPastExplicitExpiry = authExpiresAt && now.getTime() >= authExpiresAt.getTime();

      if (isPast29Days || isPastExplicitExpiry) {
        // At 29 days (or explicit authorization expiration): transition to EXPIRED
        db.prepare(`UPDATE orders SET status = 'EXPIRED', updated_at = ? WHERE order_id = ?`)
          .run(now.toISOString(), ord.order_id);

        appendAuditLog("AUTHORIZATION_EXPIRED", "order", ord.order_id, "background_reconciler", {
          reason: "29-day authorization hold limit reached",
          expiredAt: now.toISOString(),
        });

        broadcastEvent("ORDER_EXPIRED", {
          orderId: ord.order_id,
          status: "EXPIRED",
          message: "PayPal authorization hold has reached the 29-day validity limit and expired.",
          timestamp: now.toISOString(),
        });

        expiredCount++;
      } else if (elapsedMs >= SEVENTY_TWO_HOURS_MS) {
        // After 72 hours: Status STAYS 'AUTHORIZED'; emit honor period warning
        // Verify we haven't already emitted this event recently to keep audit log clean
        const recentAudit = db.prepare(`
          SELECT sequence_no FROM audit_log
          WHERE entity_id = ? AND action = 'AUTHORIZATION_HONOR_PERIOD_ENDED'
          LIMIT 1
        `).get(ord.order_id);

        if (!recentAudit) {
          appendAuditLog("AUTHORIZATION_HONOR_PERIOD_ENDED", "order", ord.order_id, "background_reconciler", {
            notice: "honor period ended, reauthorize recommended",
            elapsedHours: Math.round(elapsedMs / (1000 * 60 * 60)),
          });
        }

        broadcastEvent("AUTHORIZATION_HONOR_PERIOD_ENDED", {
          orderId: ord.order_id,
          status: "AUTHORIZED", // Status STAYS AUTHORIZED
          notice: "honor period ended, reauthorize recommended",
          elapsedHours: Math.round(elapsedMs / (1000 * 60 * 60)),
          timestamp: now.toISOString(),
        });

        honorEndedCount++;
      }
      processedCount++;
    }

    return {
      scanned: activeOrders.length,
      processed: processedCount,
      expired: expiredCount,
      honorEnded: honorEndedCount,
    };
  } finally {
    isReconciling = false;
  }
}

/**
 * Starts the in-process background timer.
 * Runs immediately on boot, then every 10 minutes.
 */
function startInProcessReconciler(intervalMs = 10 * 60 * 1000) {
  // Initial run after short delay on boot
  setTimeout(() => {
    reconcileExpiriesAndSlas().catch((err) => console.warn("[Reconcile] Initial scan notice:", err.message));
  }, 5000);

  const timer = setInterval(() => {
    reconcileExpiriesAndSlas().catch((err) => console.warn("[Reconcile] Periodic scan notice:", err.message));
  }, intervalMs);

  if (timer.unref) {
    timer.unref();
  }

  return timer;
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

module.exports = {
  reconcileExpiriesAndSlas,
  startInProcessReconciler,
};
