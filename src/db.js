"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

let DatabaseSync;
try {
  DatabaseSync = require("node:sqlite").DatabaseSync;
} catch (err) {
  console.error("\n❌ ProcureAI Error: Node.js >= 22.5.0 is required for native SQLite (node:sqlite).");
  console.error(`👉 Your current Node.js version is ${process.version}.`);
  console.error("👉 Please run: 'nvm use 24' or install Node 22+ before starting the server.\n");
  process.exit(1);
}

let dbInstance = null;
let currentDbPath = null;
let dbIsPersistent = true;

function initDb(dbPath) {
  if (dbInstance) return dbInstance;

  let resolvedPath = dbPath || process.env.DB_PATH || process.env.DATABASE_PATH || path.join(__dirname, "..", "procureai.db");
  let isPersistent = true;

  if (resolvedPath !== ":memory:") {
    try {
      const dir = path.dirname(resolvedPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      // Test write access to directory
      const testFile = path.join(dir, `.write_test_${Date.now()}`);
      fs.writeFileSync(testFile, "ok");
      fs.unlinkSync(testFile);
    } catch (fsErr) {
      console.warn(`⚠️ Warning: Specified DB directory '${path.dirname(resolvedPath)}' not accessible: ${fsErr.message}`);
      console.warn("🔄 Falling back to local ephemeral database storage at ./procureai.db");
      resolvedPath = path.join(__dirname, "..", "procureai.db");
      isPersistent = false;
    }
  } else {
    isPersistent = false;
  }

  let db;
  try {
    db = new DatabaseSync(resolvedPath);
  } catch (dbErr) {
    console.warn(`⚠️ Warning: Failed opening database at '${resolvedPath}': ${dbErr.message}`);
    resolvedPath = path.join(__dirname, "..", "procureai.db");
    isPersistent = false;
    db = new DatabaseSync(resolvedPath);
  }

  currentDbPath = resolvedPath;
  dbIsPersistent = isPersistent;
  console.log(`💾 Database initialized: ${resolvedPath} [${isPersistent ? "PERSISTENT DISK" : "EPHEMERAL"}]`);

  // Initialize schema with generous timeout
  db.exec(`
    PRAGMA busy_timeout = 10000;
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    
    CREATE TABLE IF NOT EXISTS orders (
      order_id TEXT PRIMARY KEY,
      plan_id TEXT,
      mandate_id TEXT,
      status TEXT NOT NULL,
      intent TEXT NOT NULL DEFAULT 'AUTHORIZE',
      total_inr REAL,
      total_usd TEXT,
      authorization_id TEXT,
      authorization_expires_at TEXT,
      capture_id TEXT,
      void_id TEXT,
      invoice_id TEXT,
      payout_batch_id TEXT,
      is_split_pay INTEGER DEFAULT 0,
      split_share_usd TEXT,
      split_count INTEGER DEFAULT 1,
      metadata TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS mandates (
      mandate_id TEXT PRIMARY KEY,
      plan_id TEXT NOT NULL,
      plan_version INTEGER NOT NULL,
      buyer_id TEXT,
      approver_id TEXT,
      max_total_inr REAL NOT NULL,
      max_total_usd TEXT NOT NULL,
      fx_rate REAL NOT NULL,
      fx_timestamp TEXT NOT NULL,
      price_drift_tolerance_pct REAL NOT NULL,
      payload_json TEXT NOT NULL,
      signature TEXT NOT NULL,
      public_key TEXT,
      expires_at TEXT NOT NULL,
      nonce TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS order_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      payload_json TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS webhook_events (
      event_id TEXT PRIMARY KEY,
      event_type TEXT NOT NULL,
      summary TEXT,
      payload_json TEXT NOT NULL,
      is_simulation INTEGER DEFAULT 0,
      processed_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS negotiations (
      id TEXT PRIMARY KEY,
      plan_id TEXT NOT NULL,
      rounds_json TEXT NOT NULL,
      final_discount_inr REAL NOT NULL,
      accepted INTEGER NOT NULL,
      mode TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      sequence_no INTEGER PRIMARY KEY AUTOINCREMENT,
      prev_hash TEXT NOT NULL,
      current_hash TEXT NOT NULL,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      actor TEXT NOT NULL,
      metadata_json TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS approval_tokens (
      token TEXT PRIMARY KEY,
      mandate_id TEXT NOT NULL,
      plan_version INTEGER NOT NULL,
      plan_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      used_at TEXT,
      actor TEXT
    );

    CREATE TABLE IF NOT EXISTS fx_cache (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      base TEXT NOT NULL,
      target TEXT NOT NULL,
      inr_per_usd REAL NOT NULL,
      usd_per_inr REAL NOT NULL,
      source TEXT NOT NULL,
      fetched_at TEXT NOT NULL
    );
  `);

  dbInstance = db;

  // Auto-seed genesis audit log block on cold boot if empty
  try {
    const row = db.prepare("SELECT count(*) as count FROM audit_log").get();
    if (row && row.count === 0) {
      appendAuditLog("SYSTEM_BOOT", "system", "genesis", "system", {
        version: "2.5.0",
        engine: "node:sqlite",
        environment: process.env.NODE_ENV || "development",
        message: "ProcureAI persistent cryptographic audit chain initialized",
      });
    }
    const fxRow = db.prepare("SELECT count(*) as count FROM fx_cache").get();
    if (fxRow && fxRow.count === 0) {
      const stmt = db.prepare(`
        INSERT INTO fx_cache (id, base, target, inr_per_usd, usd_per_inr, source, fetched_at)
        VALUES (1, 'USD', 'INR', 94.93, 0.010534, 'Fallback rate (cached)', ?)
      `);
      stmt.run(new Date().toISOString());
    }
  } catch (_) {}

  return dbInstance;
}

function getDb() {
  if (!dbInstance) {
    return initDb();
  }
  return dbInstance;
}

function closeDb() {
  if (dbInstance) {
    try {
      dbInstance.close();
    } catch (_) {}
    dbInstance = null;
  }
}

/**
 * Append an entry to the cryptographic audit log hash chain.
 * Each entry commits to the hash of the preceding entry.
 */
function appendAuditLog(action, entityType, entityId, actor = "system", metadata = {}) {
  const db = getDb();
  
  db.exec("BEGIN IMMEDIATE");
  try {
    // Get latest entry
    const lastRow = db.prepare("SELECT sequence_no, current_hash FROM audit_log ORDER BY sequence_no DESC LIMIT 1").get();
    
    const prevHash = lastRow ? lastRow.current_hash : "0000000000000000000000000000000000000000000000000000000000000000";
    const now = new Date().toISOString();
    const metadataStr = JSON.stringify(metadata || {});
    
    const payloadToHash = `${prevHash}|${action}|${entityType}|${entityId}|${actor}|${now}|${metadataStr}`;
    const currentHash = crypto.createHash("sha256").update(payloadToHash).digest("hex");
    
    const stmt = db.prepare(`
      INSERT INTO audit_log (prev_hash, current_hash, action, entity_type, entity_id, actor, metadata_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(prevHash, currentHash, action, entityType, entityId, actor, metadataStr, now);
    db.exec("COMMIT");
    
    return { prevHash, currentHash, action, entityType, entityId, createdAt: now };
  } catch (err) {
    try {
      db.exec("ROLLBACK");
    } catch (_) {}
    throw err;
  }
}

/**
 * Verify cryptographic integrity of the entire audit chain.
 */
function verifyAuditLogIntegrity() {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM audit_log ORDER BY sequence_no ASC").all();
  
  let expectedPrevHash = "0000000000000000000000000000000000000000000000000000000000000000";
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (row.prev_hash !== expectedPrevHash) {
      return { valid: false, brokenSequence: row.sequence_no, reason: "prev_hash mismatch" };
    }
    const payloadToHash = `${row.prev_hash}|${row.action}|${row.entity_type}|${row.entity_id}|${row.actor}|${row.created_at}|${row.metadata_json}`;
    const computedHash = crypto.createHash("sha256").update(payloadToHash).digest("hex");
    if (computedHash !== row.current_hash) {
      return { valid: false, brokenSequence: row.sequence_no, reason: "current_hash mismatch" };
    }
    expectedPrevHash = row.current_hash;
  }
  return { valid: true, count: rows.length };
}

/**
 * Resets dynamic orders and approval tokens for a clean demo recording state.
 * Appends a DEMO_RESET audit log entry to preserve hash chain continuity.
 */
function resetDemoData() {
  const db = getDb();
  db.exec("DELETE FROM approval_tokens;");
  db.exec("DELETE FROM orders;");
  appendAuditLog("DEMO_RESET", "system", "demo_system", "system", { resetAt: new Date().toISOString() });
  return true;
}

function saveCachedFx({ base, target, inrPerUsd, usdPerInr, source, fetchedAt }) {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO fx_cache (id, base, target, inr_per_usd, usd_per_inr, source, fetched_at)
    VALUES (1, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      base = excluded.base,
      target = excluded.target,
      inr_per_usd = excluded.inr_per_usd,
      usd_per_inr = excluded.usd_per_inr,
      source = excluded.source,
      fetched_at = excluded.fetched_at
  `);
  stmt.run(base, target, inrPerUsd, usdPerInr, source, fetchedAt || new Date().toISOString());
}

function getDbCachedFx() {
  const db = getDb();
  const row = db.prepare("SELECT * FROM fx_cache WHERE id = 1").get();
  if (!row) return null;
  return {
    base: row.base,
    target: row.target,
    direction: "USD_TO_INR",
    inrPerUsd: row.inr_per_usd,
    usdPerInr: row.usd_per_inr,
    rate: row.usd_per_inr,
    inrToUsd: row.usd_per_inr,
    displayRate: `${row.inr_per_usd.toFixed(2)} INR per USD`,
    source: "Fallback rate (cached)",
    timestamp: row.fetched_at,
    fetchedAt: row.fetched_at,
    isCachedFallback: true,
  };
}

function isDbPersistent() {
  if (!dbInstance) initDb();
  return dbIsPersistent;
}

function getDbPath() {
  if (!dbInstance) initDb();
  return currentDbPath;
}

module.exports = {
  initDb,
  getDb,
  closeDb,
  isDbPersistent,
  getDbPath,
  appendAuditLog,
  verifyAuditLogIntegrity,
  resetDemoData,
  saveCachedFx,
  getDbCachedFx,
};
