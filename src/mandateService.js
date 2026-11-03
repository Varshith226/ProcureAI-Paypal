"use strict";

const crypto = require("node:crypto");
const { getDb, appendAuditLog } = require("./db");

// Persistent server-side Ed25519 keypair for cryptographic mandate signing
let keyPair = null;
let keyFingerprint = null;

function getKeyPair() {
  if (!keyPair) {
    if (process.env.MANDATE_PRIVATE_KEY_PEM && process.env.MANDATE_PUBLIC_KEY_PEM) {
      keyPair = {
        privateKey: crypto.createPrivateKey(process.env.MANDATE_PRIVATE_KEY_PEM),
        publicKey: crypto.createPublicKey(process.env.MANDATE_PUBLIC_KEY_PEM),
      };
    } else {
      // Generate standard Ed25519 keypair
      keyPair = crypto.generateKeyPairSync("ed25519");
    }
    const pubDer = keyPair.publicKey.export({ type: "spki", format: "der" });
    keyFingerprint = crypto.createHash("sha256").update(pubDer).digest("hex").slice(0, 16).toUpperCase();
  }
  return keyPair;
}

function getKeyFingerprint() {
  if (!keyFingerprint) {
    getKeyPair();
  }
  return keyFingerprint;
}

/**
 * Deterministic JSON stringifier to ensure exact signature consistency across languages and runs.
 */
function canonicalStringify(obj) {
  if (obj === null || typeof obj !== "object") {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return "[" + obj.map(canonicalStringify).join(",") + "]";
  }
  const sortedKeys = Object.keys(obj).sort();
  const entries = sortedKeys.map((k) => `${JSON.stringify(k)}:${canonicalStringify(obj[k])}`);
  return "{" + entries.join(",") + "}";
}

/**
 * Create and sign a verifiable Spending Mandate for agentic commerce.
 */
function createSignedMandate({
  mandateId = null,
  planId,
  planVersion = 1,
  buyerId = "buyer_org_in",
  approverId = "finance_lead_01",
  items = [],
  currency = "INR",
  maxTotalINR,
  maxTotalUSD,
  fxRate = 0.0119,
  fxTimestamp = new Date().toISOString(),
  priceDriftTolerancePct = 0,
  allowedMerchants = ["*"],
  expiresInMinutes = 60 * 24 * 7, // 7 days default
}) {
  const { privateKey, publicKey } = getKeyPair();

  const id = mandateId || `mandate_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + expiresInMinutes * 60 * 1000).toISOString();
  const nonce = crypto.randomUUID();

  // Core payload to be signed
  const payload = {
    mandateId: id,
    standard: "AP2_COMPLIANT_AGENTIC_MANDATE_V1",
    planId,
    planVersion: Number(planVersion),
    buyerId,
    approverId,
    items: items.map((it) => ({
      productId: it.productId || it.id,
      name: it.name,
      quantity: Number(it.quantity || 1),
      unitPriceINR: Number(it.unitPriceINR || 0),
      specs: it.specs || null,
    })),
    currency,
    maxTotalINR: Number(maxTotalINR),
    maxTotalUSD: String(maxTotalUSD),
    fxRate: Number(fxRate),
    fxTimestamp,
    priceDriftTolerancePct: Number(priceDriftTolerancePct),
    allowedMerchants,
    expiresAt,
    nonce,
    createdAt: now.toISOString(),
  };

  const canonical = canonicalStringify(payload);
  const signature = crypto.sign(null, Buffer.from(canonical), privateKey).toString("hex");
  const pubPem = publicKey.export({ type: "spki", format: "pem" });

  const record = {
    ...payload,
    signature,
    keyFingerprint: getKeyFingerprint(),
    publicKeyPem: pubPem,
  };

  // Persist into SQLite
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO mandates (
      mandate_id, plan_id, plan_version, buyer_id, approver_id,
      max_total_inr, max_total_usd, fx_rate, fx_timestamp,
      price_drift_tolerance_pct, payload_json, signature, public_key,
      expires_at, nonce, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    id,
    planId,
    Number(planVersion),
    buyerId,
    approverId,
    Number(maxTotalINR),
    String(maxTotalUSD),
    Number(fxRate),
    fxTimestamp,
    Number(priceDriftTolerancePct),
    JSON.stringify(payload),
    signature,
    pubPem,
    expiresAt,
    nonce,
    now.toISOString()
  );

  appendAuditLog("MANDATE_CREATED", "mandate", id, approverId, {
    planId,
    maxTotalINR,
    maxTotalUSD,
    planVersion,
  });

  return record;
}

/**
 * Verify a mandate payload against its cryptographic signature.
 */
function verifyMandateSignature(payload, signature, customPubPem = null) {
  try {
    const { publicKey } = getKeyPair();
    const pubKeyToUse = customPubPem ? crypto.createPublicKey(customPubPem) : publicKey;

    // Clean payload of record metadata if passed full record
    const cleanPayload = { ...payload };
    delete cleanPayload.signature;
    delete cleanPayload.keyFingerprint;
    delete cleanPayload.publicKeyPem;

    const canonical = canonicalStringify(cleanPayload);
    const valid = crypto.verify(
      null,
      Buffer.from(canonical),
      pubKeyToUse,
      Buffer.from(signature, "hex")
    );
    return valid;
  } catch (err) {
    return false;
  }
}

/**
 * Retrieve a mandate by ID from the database.
 */
function getMandateById(mandateId) {
  const db = getDb();
  const row = db.prepare("SELECT * FROM mandates WHERE mandate_id = ?").get(mandateId);
  if (!row) return null;

  const payload = JSON.parse(row.payload_json);
  return {
    ...payload,
    signature: row.signature,
    publicKeyPem: row.public_key,
    keyFingerprint: getKeyFingerprint(),
  };
}

/**
 * Strict server-side enforcement boundary:
 * The PayPal authorize endpoint MUST refuse any order whose total exceeds
 * the ceiling, whose plan version is stale, whose mandate expired, or
 * whose signature fails.
 */
function enforceMandate({
  mandateId,
  planVersion,
  totalINR,
  totalUSD,
  merchantId = null,
  tamperedPayload = null,
}) {
  const mandate = getMandateById(mandateId);
  if (!mandate) {
    return {
      allowed: false,
      code: "MANDATE_NOT_FOUND",
      message: `Safety Boundary: Mandate '${mandateId}' does not exist. Autonomous execution refused.`,
    };
  }

  // 1. Signature check
  const payloadToVerify = tamperedPayload || {
    mandateId: mandate.mandateId,
    standard: mandate.standard,
    planId: mandate.planId,
    planVersion: mandate.planVersion,
    buyerId: mandate.buyerId,
    approverId: mandate.approverId,
    items: mandate.items,
    currency: mandate.currency,
    maxTotalINR: mandate.maxTotalINR,
    maxTotalUSD: mandate.maxTotalUSD,
    fxRate: mandate.fxRate,
    fxTimestamp: mandate.fxTimestamp,
    priceDriftTolerancePct: mandate.priceDriftTolerancePct,
    allowedMerchants: mandate.allowedMerchants,
    expiresAt: mandate.expiresAt,
    nonce: mandate.nonce,
    createdAt: mandate.createdAt,
  };

  const isSigValid = verifyMandateSignature(payloadToVerify, mandate.signature, mandate.publicKeyPem);
  if (!isSigValid) {
    return {
      allowed: false,
      code: "INVALID_SIGNATURE",
      message: "Safety Boundary: Mandate signature verification failed. Payload may have been tampered with.",
    };
  }

  // 2. Expiration check
  const now = new Date();
  if (new Date(mandate.expiresAt) <= now) {
    return {
      allowed: false,
      code: "MANDATE_EXPIRED",
      message: `Safety Boundary: Mandate expired at ${mandate.expiresAt}. Re-approval required.`,
    };
  }

  // 3. Plan version check (prevents executing against stale approvals after price spike)
  if (planVersion !== undefined && planVersion !== null && Number(planVersion) !== mandate.planVersion) {
    return {
      allowed: false,
      code: "STALE_PLAN_VERSION",
      message: `Safety Boundary: Plan version mismatch (Mandate specifies v${mandate.planVersion}, order specifies v${planVersion}). Re-authorization refused.`,
    };
  }

  // 4. Authorized ceiling enforcement
  if (totalINR !== undefined && (Number(totalINR) <= 0 || !Number.isFinite(Number(totalINR)))) {
    return {
      allowed: false,
      code: "INVALID_AMOUNT",
      message: "Safety Boundary: Order total must be a positive number.",
    };
  }

  const allowedCeiling = mandate.maxTotalINR * (1 + (mandate.priceDriftTolerancePct || 0) / 100);
  if (Number(totalINR) > allowedCeiling) {
    return {
      allowed: false,
      code: "CEILING_EXCEEDED",
      message: `Safety Boundary: Order total ₹${Number(totalINR).toLocaleString()} exceeds the authorized spending ceiling of ₹${allowedCeiling.toLocaleString()}.`,
    };
  }

  // 5. Merchant check (if restricted)
  if (
    merchantId &&
    mandate.allowedMerchants &&
    !mandate.allowedMerchants.includes("*") &&
    !mandate.allowedMerchants.includes(merchantId)
  ) {
    return {
      allowed: false,
      code: "UNAUTHORIZED_MERCHANT",
      message: `Safety Boundary: Merchant '${merchantId}' is not permitted by this spending mandate.`,
    };
  }

  return {
    allowed: true,
    mandate,
  };
}

module.exports = {
  createSignedMandate,
  verifyMandateSignature,
  getMandateById,
  enforceMandate,
  getKeyFingerprint,
  canonicalStringify,
};

