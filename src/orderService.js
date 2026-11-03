"use strict";

const { getDb, appendAuditLog } = require("./db");
const { broadcastEvent } = require("./sseService");

function createOrderRecord({
  orderId,
  planId,
  mandateId = null,
  intent = "AUTHORIZE",
  totalINR,
  totalUSD,
  isSplitPay = false,
  splitShareUSD = null,
  splitCount = 1,
  metadata = {},
}) {
  const db = getDb();
  const now = new Date().toISOString();

  const stmt = db.prepare(`
    INSERT INTO orders (
      order_id, plan_id, mandate_id, status, intent, total_inr, total_usd,
      is_split_pay, split_share_usd, split_count, metadata, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    orderId,
    planId || null,
    mandateId || null,
    "CREATED",
    intent,
    totalINR ? Number(totalINR) : null,
    totalUSD ? String(totalUSD) : null,
    isSplitPay ? 1 : 0,
    splitShareUSD ? String(splitShareUSD) : null,
    splitCount ? Number(splitCount) : 1,
    JSON.stringify(metadata || {}),
    now,
    now
  );

  recordOrderEvent(orderId, "ORDER_CREATED", {
    orderId,
    planId,
    mandateId,
    intent,
    totalINR,
    totalUSD,
  });

  appendAuditLog("ORDER_CREATED", "order", orderId, "system", {
    planId,
    mandateId,
    totalINR,
    totalUSD,
  });

  return getOrder(orderId);
}

function getOrder(orderId) {
  const db = getDb();
  const row = db.prepare("SELECT * FROM orders WHERE order_id = ?").get(orderId);
  if (!row) return null;
  return {
    ...row,
    is_split_pay: Boolean(row.is_split_pay),
    metadata: row.metadata ? JSON.parse(row.metadata) : {},
  };
}

function listOrders(limit = 100) {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM orders ORDER BY created_at DESC LIMIT ?").all(limit);
  return rows.map((row) => ({
    ...row,
    is_split_pay: Boolean(row.is_split_pay),
    metadata: row.metadata ? JSON.parse(row.metadata) : {},
  }));
}

function updateOrderStatus(orderId, status, fields = {}) {
  const db = getDb();
  const now = new Date().toISOString();

  const updates = ["status = ?", "updated_at = ?"];
  const values = [status, now];

  if (fields.authorizationId) {
    updates.push("authorization_id = ?");
    values.push(fields.authorizationId);
  }
  if (fields.authorizationExpiresAt) {
    updates.push("authorization_expires_at = ?");
    values.push(fields.authorizationExpiresAt);
  }
  if (fields.captureId) {
    updates.push("capture_id = ?");
    values.push(fields.captureId);
  }
  if (fields.voidId) {
    updates.push("void_id = ?");
    values.push(fields.voidId);
  }
  if (fields.invoiceId) {
    updates.push("invoice_id = ?");
    values.push(fields.invoiceId);
  }
  if (fields.payoutBatchId) {
    updates.push("payout_batch_id = ?");
    values.push(fields.payoutBatchId);
  }

  values.push(orderId);
  const sql = `UPDATE orders SET ${updates.join(", ")} WHERE order_id = ?`;
  db.prepare(sql).run(...values);

  recordOrderEvent(orderId, `STATUS_${status}`, {
    status,
    ...fields,
  });

  appendAuditLog(`ORDER_${status}`, "order", orderId, "system", fields);

  const updated = getOrder(orderId);
  broadcastEvent("ORDER_UPDATED", updated);
  return updated;
}

function recordOrderEvent(orderId, eventType, payload = {}) {
  const db = getDb();
  const now = new Date().toISOString();
  const stmt = db.prepare(`
    INSERT INTO order_events (order_id, event_type, payload_json, created_at)
    VALUES (?, ?, ?, ?)
  `);
  stmt.run(orderId, eventType, JSON.stringify(payload), now);

  broadcastEvent("ORDER_EVENT", {
    orderId,
    eventType,
    payload,
    timestamp: now,
  });
}

function listOrderEvents(orderId) {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM order_events WHERE order_id = ? ORDER BY id ASC").all(orderId);
  return rows.map((r) => ({
    id: r.id,
    orderId: r.order_id,
    eventType: r.event_type,
    payload: JSON.parse(r.payload_json || "{}"),
    createdAt: r.created_at,
  }));
}

function recordWebhookEvent({
  eventId,
  eventType,
  summary = "",
  payload,
  isSimulation = false,
}) {
  const db = getDb();
  const now = new Date().toISOString();

  // Idempotent insertion
  const existing = db.prepare("SELECT event_id FROM webhook_events WHERE event_id = ?").get(eventId);
  if (existing) {
    return { alreadyProcessed: true, eventId };
  }

  const stmt = db.prepare(`
    INSERT INTO webhook_events (event_id, event_type, summary, payload_json, is_simulation, processed_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    eventId,
    eventType,
    summary,
    JSON.stringify(payload),
    isSimulation ? 1 : 0,
    now
  );

  appendAuditLog("WEBHOOK_RECEIVED", "webhook", eventId, "paypal", {
    eventType,
    isSimulation,
  });

  const eventRecord = {
    eventId,
    eventType,
    summary,
    payload,
    isSimulation,
    processedAt: now,
  };

  broadcastEvent("WEBHOOK_EVENT", eventRecord);
  return { alreadyProcessed: false, eventRecord };
}

function listWebhookEvents(limit = 50) {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM webhook_events ORDER BY processed_at DESC LIMIT ?").all(limit);
  return rows.map((r) => ({
    eventId: r.event_id,
    eventType: r.event_type,
    summary: r.summary,
    payload: JSON.parse(r.payload_json || "{}"),
    isSimulation: Boolean(r.is_simulation),
    processedAt: r.processed_at,
  }));
}

function listAuditLog(limit = 100) {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM audit_log ORDER BY sequence_no DESC LIMIT ?").all(limit);
  return rows.map((r) => ({
    sequenceNo: r.sequence_no,
    prevHash: r.prev_hash,
    currentHash: r.current_hash,
    action: r.action,
    entityType: r.entity_type,
    entityId: r.entity_id,
    actor: r.actor,
    metadata: JSON.parse(r.metadata_json || "{}"),
    createdAt: r.created_at,
  }));
}

module.exports = {
  createOrderRecord,
  getOrder,
  listOrders,
  updateOrderStatus,
  recordOrderEvent,
  listOrderEvents,
  recordWebhookEvent,
  listWebhookEvents,
  listAuditLog,
};

