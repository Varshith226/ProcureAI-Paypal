"use strict";

const { isValidRupeeAmount } = require("./money");
const { getRule, validateConstraintValue } = require("./constraintRegistry");

/**
 * Validates the canonical procurement request (see shared/contracts.json).
 *
 * Returns { ok: true, value, warnings } with a normalized copy of the request,
 * or { ok: false, errors } where each error is { field, message }.
 *
 * Policies (documented in docs/procurement-engine.md):
 *  - weights must contain exactly quality, reliability and delivery, each a
 *    finite number in [0, 1], summing to 1 (±0.001). They are NOT normalized.
 *  - if `weights` is omitted entirely, DEFAULT_WEIGHTS are used and a warning
 *    is returned. A partially specified weights object is an error.
 *  - category names are trimmed and lower-cased; nothing else is rewritten.
 */

const DEFAULT_WEIGHTS = Object.freeze({ quality: 0.45, reliability: 0.35, delivery: 0.2 });
const WEIGHT_KEYS = ["quality", "reliability", "delivery"];
const WEIGHT_SUM_TOLERANCE = 0.001;
const MAX_QUANTITY_PER_CATEGORY = 100;
const MAX_CATEGORIES = 20;
const MAX_DELIVERY_DAYS = 365;

class ValidationError extends Error {
  constructor(errors) {
    super(errors.map((e) => `${e.field}: ${e.message}`).join("; "));
    this.name = "ValidationError";
    this.errors = errors;
  }
}

const isPlainObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

function validateRequest(body) {
  const errors = [];
  const warnings = [];
  const err = (field, message) => errors.push({ field, message });

  if (!isPlainObject(body)) {
    return { ok: false, errors: [{ field: "(body)", message: "request body must be a JSON object" }] };
  }

  // requestId
  if (typeof body.requestId !== "string" || body.requestId.trim() === "") {
    err("requestId", "is required and must be a non-empty string");
  } else if (body.requestId.length > 128) {
    err("requestId", "must be at most 128 characters");
  }

  // rawQuery (kept for traceability; optional)
  if (body.rawQuery !== undefined && body.rawQuery !== null && typeof body.rawQuery !== "string") {
    err("rawQuery", "must be a string when provided");
  }

  // budgetINR
  if (body.budgetINR === undefined || body.budgetINR === null) {
    err("budgetINR", "is required");
  } else if (!isValidRupeeAmount(body.budgetINR) || body.budgetINR <= 0) {
    err("budgetINR", "must be a positive number of rupees with at most 2 decimal places");
  }

  // maxDeliveryDays
  if (body.maxDeliveryDays === undefined || body.maxDeliveryDays === null) {
    err("maxDeliveryDays", "is required (use a whole number of days)");
  } else if (
    !Number.isInteger(body.maxDeliveryDays) ||
    body.maxDeliveryDays < 0 ||
    body.maxDeliveryDays > MAX_DELIVERY_DAYS
  ) {
    err("maxDeliveryDays", `must be a whole number between 0 and ${MAX_DELIVERY_DAYS}`);
  }

  // requiredCategories
  const requiredCategories = [];
  if (!Array.isArray(body.requiredCategories) || body.requiredCategories.length === 0) {
    err("requiredCategories", "is required and must be a non-empty array");
  } else if (body.requiredCategories.length > MAX_CATEGORIES) {
    err("requiredCategories", `must contain at most ${MAX_CATEGORIES} categories`);
  } else {
    const seen = new Set();
    body.requiredCategories.forEach((entry, i) => {
      const path = `requiredCategories[${i}]`;
      if (!isPlainObject(entry)) return err(path, "must be an object { category, quantity }");
      if (typeof entry.category !== "string" || entry.category.trim() === "") {
        return err(`${path}.category`, "must be a non-empty string");
      }
      const category = entry.category.trim().toLowerCase();
      if (
        !Number.isInteger(entry.quantity) ||
        entry.quantity < 1 ||
        entry.quantity > MAX_QUANTITY_PER_CATEGORY
      ) {
        return err(`${path}.quantity`, `must be a whole number between 1 and ${MAX_QUANTITY_PER_CATEGORY}`);
      }
      if (seen.has(category)) {
        return err(`${path}.category`, `duplicate category '${category}'; combine the quantities into one entry`);
      }
      seen.add(category);
      requiredCategories.push({ category, quantity: entry.quantity });
    });
  }

  // hardConstraints
  const hardConstraints = {};
  if (body.hardConstraints !== undefined && body.hardConstraints !== null) {
    if (!isPlainObject(body.hardConstraints)) {
      err("hardConstraints", "must be an object keyed by category");
    } else {
      const required = new Set(requiredCategories.map((c) => c.category));
      for (const [rawCategory, constraints] of Object.entries(body.hardConstraints)) {
        const category = rawCategory.trim().toLowerCase();
        const path = `hardConstraints.${rawCategory}`;
        if (!required.has(category)) {
          err(path, `category '${category}' is not listed in requiredCategories`);
          continue;
        }
        if (!isPlainObject(constraints)) {
          err(path, "must be an object of constraint key -> value");
          continue;
        }
        hardConstraints[category] = {};
        for (const [key, value] of Object.entries(constraints)) {
          const rule = getRule(category, key);
          if (!rule) {
            err(`${path}.${key}`, `unsupported hard constraint for '${category}' (see GET /api/procurement/contract)`);
            continue;
          }
          const problem = validateConstraintValue(rule, value);
          if (problem) {
            err(`${path}.${key}`, problem);
            continue;
          }
          hardConstraints[category][key] = value;
        }
      }
    }
  }

  // weights
  let weights;
  let weightsSource;
  if (body.weights === undefined || body.weights === null) {
    weights = { ...DEFAULT_WEIGHTS };
    weightsSource = "DEFAULT";
    warnings.push(
      `No weights supplied; default weights were used (quality ${DEFAULT_WEIGHTS.quality}, reliability ${DEFAULT_WEIGHTS.reliability}, delivery ${DEFAULT_WEIGHTS.delivery}).`
    );
  } else if (!isPlainObject(body.weights)) {
    err("weights", "must be an object { quality, reliability, delivery }");
  } else {
    const extra = Object.keys(body.weights).filter((k) => !WEIGHT_KEYS.includes(k));
    if (extra.length) err("weights", `unsupported weight key(s): ${extra.join(", ")}`);
    let valid = extra.length === 0;
    for (const k of WEIGHT_KEYS) {
      const w = body.weights[k];
      if (typeof w !== "number" || !Number.isFinite(w) || w < 0 || w > 1) {
        err(`weights.${k}`, "is required and must be a number between 0 and 1");
        valid = false;
      }
    }
    if (valid) {
      const sum = WEIGHT_KEYS.reduce((s, k) => s + body.weights[k], 0);
      if (Math.abs(sum - 1) > WEIGHT_SUM_TOLERANCE) {
        err("weights", `must sum to 1 (got ${Number(sum.toFixed(6))}); weights are not normalized automatically`);
      } else {
        weights = Object.fromEntries(WEIGHT_KEYS.map((k) => [k, body.weights[k]]));
        weightsSource = "REQUEST";
      }
    }
  }

  if (errors.length) return { ok: false, errors };

  return {
    ok: true,
    warnings,
    value: {
      requestId: body.requestId.trim(),
      rawQuery: typeof body.rawQuery === "string" ? body.rawQuery : null,
      budgetINR: body.budgetINR,
      maxDeliveryDays: body.maxDeliveryDays,
      requiredCategories,
      hardConstraints,
      weights,
      weightsSource,
    },
  };
}

module.exports = { validateRequest, ValidationError, DEFAULT_WEIGHTS, WEIGHT_SUM_TOLERANCE };
