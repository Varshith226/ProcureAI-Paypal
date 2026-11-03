"use strict";

const crypto = require("node:crypto");
const { getDb, appendAuditLog } = require("./db");

/**
 * Single-use Expiring Approval Token Service
 * Enforces cryptographic governance and prevents replayed or stale approvals.
 */

function createApprovalToken({
  mandateId,
  planVersion = 1,
  planId,
  expiresInMinutes = 60,
  actor = "system",
}) {
  if (!mandateId) {
    throw new Error("mandateId is required to create an approval token");
  }

  const token = `tok_appr_${Date.now()}_${crypto.randomBytes(12).toString("hex")}`;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + expiresInMinutes * 60 * 1000).toISOString();
  const createdAt = now.toISOString();

  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO approval_tokens (token, mandate_id, plan_version, plan_id, created_at, expires_at, used_at, actor)
    VALUES (?, ?, ?, ?, ?, ?, NULL, ?)
  `);

  stmt.run(token, mandateId, planVersion, planId || "plan_unknown", createdAt, expiresAt, actor);

  appendAuditLog("APPROVAL_TOKEN_CREATED", "approval_token", token, actor, {
    mandateId,
    planVersion,
    planId,
    expiresAt,
  });

  return {
    token,
    mandateId,
    planVersion,
    planId,
    createdAt,
    expiresAt,
    expiresInMinutes,
  };
}

function getApprovalToken(token) {
  if (!token) return null;
  const db = getDb();
  return db.prepare("SELECT * FROM approval_tokens WHERE token = ?").get(token);
}

function validateApprovalToken(token, { mandateId, planVersion } = {}) {
  const record = getApprovalToken(token);
  if (!record) {
    return {
      valid: false,
      code: "TOKEN_NOT_FOUND",
      message: "Approval token does not exist or is invalid.",
    };
  }

  if (record.used_at) {
    return {
      valid: false,
      code: "TOKEN_ALREADY_USED",
      message: `Single-use approval token was already consumed at ${record.used_at}.`,
      usedAt: record.used_at,
    };
  }

  const now = new Date();
  const expiry = new Date(record.expires_at);
  if (now > expiry) {
    return {
      valid: false,
      code: "TOKEN_EXPIRED",
      message: `Approval token expired at ${record.expires_at}.`,
      expiresAt: record.expires_at,
    };
  }

  if (mandateId && record.mandate_id !== mandateId) {
    return {
      valid: false,
      code: "MANDATE_MISMATCH",
      message: `Approval token belongs to mandate ${record.mandate_id}, not requested ${mandateId}.`,
    };
  }

  if (planVersion !== undefined && record.plan_version !== planVersion) {
    return {
      valid: false,
      code: "STALE_PLAN_VERSION",
      message: `Plan version has changed to v${planVersion} since token was issued for v${record.plan_version}. Re-approval required.`,
    };
  }

  return {
    valid: true,
    tokenRecord: {
      token: record.token,
      mandateId: record.mandate_id,
      planVersion: record.plan_version,
      planId: record.plan_id,
      expiresAt: record.expires_at,
    },
  };
}

function consumeApprovalToken(token, { mandateId, planVersion, approverId = "executive_lead" } = {}) {
  const validation = validateApprovalToken(token, { mandateId, planVersion });
  if (!validation.valid) {
    return validation;
  }

  const db = getDb();
  const now = new Date().toISOString();

  const stmt = db.prepare(`
    UPDATE approval_tokens
    SET used_at = ?, actor = ?
    WHERE token = ? AND used_at IS NULL
  `);

  const result = stmt.run(now, approverId, token);
  if (result.changes === 0) {
    return {
      valid: false,
      code: "CONCURRENT_USE",
      message: "Approval token was concurrently consumed by another session.",
    };
  }

  appendAuditLog("APPROVAL_TOKEN_CONSUMED", "approval_token", token, approverId, {
    mandateId: validation.tokenRecord.mandateId,
    planVersion: validation.tokenRecord.planVersion,
    consumedAt: now,
  });

  return {
    valid: true,
    success: true,
    consumedAt: now,
    approverId,
    mandateId: validation.tokenRecord.mandateId,
    planVersion: validation.tokenRecord.planVersion,
  };
}

module.exports = {
  createApprovalToken,
  getApprovalToken,
  validateApprovalToken,
  consumeApprovalToken,
};

