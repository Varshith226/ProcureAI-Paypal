"use strict";

const { getRule } = require("./constraintRegistry");

/**
 * Deterministic hard-constraint verifier.
 *
 * Each mandatory check returns one of:
 *   PASS     the catalog record has the fact and it satisfies the constraint
 *   FAIL     the catalog record has the fact and it violates the constraint
 *   UNKNOWN  the fact is missing, so the constraint cannot be confirmed
 *
 * Policy: a product is ELIGIBLE for optimization only if every mandatory check
 * is PASS. UNKNOWN is never treated as a pass (unknown shipping is not
 * assumed to be zero, unknown refresh rate is not assumed to be 144 Hz, ...).
 *
 * Note: checks evaluate the catalog record. How trustworthy that record is
 * (synthetic demo / unchecked / source-verified) is reported separately by
 * describeEvidence().
 *
 * Price is NOT a per-product rejection reason: budget feasibility is decided at
 * basket level by the optimizer.
 */

const CHECK = Object.freeze({ PASS: "PASS", FAIL: "FAIL", UNKNOWN: "UNKNOWN" });

/** Freshness window for treating a source-backed record as VERIFIED. */
const VERIFIED_FRESHNESS_HOURS = 24;

const CATEGORY_LABEL = {
  monitor: "Monitor",
  keyboard: "Keyboard",
  mouse: "Mouse",
  headphones: "Headphones",
  laptop: "Laptop",
};
const categoryLabel = (c) => CATEGORY_LABEL[c] || c.charAt(0).toUpperCase() + c.slice(1);

function readField(product, field) {
  return field.split(".").reduce((obj, key) => (obj == null ? undefined : obj[key]), product);
}

const fmt = (value, unit) => {
  if (unit === "INR") return `₹${Number(value).toLocaleString("en-IN")}`;
  return unit ? `${value} ${unit}` : `${value}`;
};

function checkRule(product, key, rule, expected) {
  const label = `${categoryLabel(product.category)} ${rule.label}`;
  const actual = readField(product, rule.field);
  const base = { checkId: `constraint.${key}`, group: "SPEC", mandatory: true };

  if (actual === undefined || actual === null || (typeof actual === "string" && actual.trim() === "")) {
    return {
      ...base,
      status: CHECK.UNKNOWN,
      detail: `${label} is not listed, so the mandatory '${key}' requirement could not be verified.`,
    };
  }

  switch (rule.kind) {
    case "min": {
      if (typeof actual !== "number") {
        return { ...base, status: CHECK.UNKNOWN, detail: `${label} value '${actual}' is not numeric; cannot verify.` };
      }
      return actual >= expected
        ? { ...base, status: CHECK.PASS, detail: `${label} is ${fmt(actual, rule.unit)} (at least ${fmt(expected, rule.unit)} required).` }
        : { ...base, status: CHECK.FAIL, detail: `${label} is ${fmt(actual, rule.unit)}; at least ${fmt(expected, rule.unit)} is required.` };
    }
    case "max": {
      if (typeof actual !== "number") {
        return { ...base, status: CHECK.UNKNOWN, detail: `${label} value '${actual}' is not numeric; cannot verify.` };
      }
      return actual <= expected
        ? { ...base, status: CHECK.PASS, detail: `${label} is ${fmt(actual, rule.unit)} (at most ${fmt(expected, rule.unit)} allowed).` }
        : { ...base, status: CHECK.FAIL, detail: `${label} is ${fmt(actual, rule.unit)}; at most ${fmt(expected, rule.unit)} is allowed.` };
    }
    case "in":
    case "notIn": {
      const a = String(actual).toLowerCase();
      const listed = expected.map((v) => v.toLowerCase()).includes(a);
      const ok = rule.kind === "in" ? listed : !listed;
      const phrase = rule.kind === "in" ? `must be one of: ${expected.join(", ")}` : `must not be: ${expected.join(", ")}`;
      return ok
        ? { ...base, status: CHECK.PASS, detail: `${label} is ${actual} (${phrase}).` }
        : { ...base, status: CHECK.FAIL, detail: `${label} is ${actual}; it ${phrase}.` };
    }
    case "equals": {
      if (typeof actual !== "boolean") {
        return { ...base, status: CHECK.UNKNOWN, detail: `${label} value '${actual}' is not a yes/no fact; cannot verify.` };
      }
      return actual === expected
        ? { ...base, status: CHECK.PASS, detail: `${label}: ${actual ? "yes" : "no"} (required: ${expected ? "yes" : "no"}).` }
        : { ...base, status: CHECK.FAIL, detail: `${label}: ${actual ? "yes" : "no"}; required: ${expected ? "yes" : "no"}.` };
    }
    default:
      return { ...base, status: CHECK.UNKNOWN, detail: `Unsupported rule kind '${rule.kind}'.` };
  }
}

/**
 * Verifies one product against the request.
 * ctx = { categoryQuantity, maxDeliveryDays, constraints }   (constraints for this category)
 */
function verifyProduct(product, ctx) {
  const checks = [];
  const warnings = [];
  const stockNotes = []; // informational: the optimizer never exceeds stock
  const add = (c) => checks.push({ mandatory: true, ...c });

  // Price
  add(
    product.unitPriceINR === null
      ? { checkId: "price.known", group: "PRICE", status: CHECK.UNKNOWN, detail: "Unit price is not available, so the basket total cannot be computed." }
      : { checkId: "price.known", group: "PRICE", status: CHECK.PASS, detail: `Unit price listed (₹${product.unitPriceINR.toLocaleString("en-IN")}).` }
  );

  // Shipping — never assumed to be zero.
  add(
    product.shippingINR === null
      ? { checkId: "shipping.known", group: "PRICE", status: CHECK.UNKNOWN, detail: "Shipping cost is unknown and is not assumed to be zero, so the exact total cannot be computed." }
      : { checkId: "shipping.known", group: "PRICE", status: CHECK.PASS, detail: product.shippingINR === 0 ? "Free shipping listed." : `Shipping ₹${product.shippingINR.toLocaleString("en-IN")} per order line.` }
  );

  // Stock
  if (product.stockQuantity === null) {
    add({ checkId: "stock.available", group: "STOCK", status: CHECK.UNKNOWN, detail: "Stock availability is unknown." });
  } else if (product.stockQuantity === 0) {
    add({ checkId: "stock.available", group: "STOCK", status: CHECK.FAIL, detail: "Out of stock (0 units available)." });
  } else {
    add({ checkId: "stock.available", group: "STOCK", status: CHECK.PASS, detail: `${product.stockQuantity} unit(s) in stock.` });
    if (product.stockQuantity < ctx.categoryQuantity) {
      const note = `Only ${product.stockQuantity} in stock; it can cover at most ${product.stockQuantity} of the ${ctx.categoryQuantity} requested ${product.category} unit(s).`;
      warnings.push(note);
      stockNotes.push(note);
    }
  }

  // Delivery
  if (product.deliveryDays === null) {
    add({ checkId: "delivery.withinLimit", group: "DELIVERY", status: CHECK.UNKNOWN, detail: `Delivery estimate is unknown; cannot confirm delivery within ${ctx.maxDeliveryDays} days.` });
  } else if (product.deliveryDays > ctx.maxDeliveryDays) {
    add({ checkId: "delivery.withinLimit", group: "DELIVERY", status: CHECK.FAIL, detail: `Estimated delivery is ${product.deliveryDays} days; the maximum allowed is ${ctx.maxDeliveryDays} days.` });
  } else {
    add({ checkId: "delivery.withinLimit", group: "DELIVERY", status: CHECK.PASS, detail: `Estimated delivery ${product.deliveryDays} day(s) (limit ${ctx.maxDeliveryDays}).` });
  }

  // Request-specific hard constraints
  for (const [key, expected] of Object.entries(ctx.constraints || {})) {
    const rule = getRule(product.category, key);
    if (!rule) {
      // Should not happen: the request validator rejects unknown keys.
      add({ checkId: `constraint.${key}`, group: "SPEC", status: CHECK.UNKNOWN, detail: `Constraint '${key}' is not supported and cannot be verified.` });
      continue;
    }
    add(checkRule(product, key, rule, expected));
  }

  // Soft data gaps: warnings only, never rejection.
  if (product.qualityScore === null) warnings.push("Quality score unknown; it contributes 0 to the composite score.");
  if (product.reliabilityScore === null) warnings.push("Reliability score unknown; it contributes 0 to the composite score.");
  if (product.warrantyMonths === null) warnings.push("Warranty not confirmed.");

  const failed = checks.filter((c) => c.mandatory && c.status === CHECK.FAIL);
  const unknown = checks.filter((c) => c.mandatory && c.status === CHECK.UNKNOWN);
  const eligible = failed.length === 0 && unknown.length === 0;

  let rejectedReason = null;
  let rejectionType = null;
  if (!eligible) {
    rejectionType = failed.length ? "FAILED_HARD_CONSTRAINT" : "UNVERIFIABLE_MANDATORY_DATA";
    const parts = [
      ...failed.map((c) => `Failed hard constraint: ${c.detail}`),
      ...unknown.map((c) => `Could not verify: ${c.detail}`),
    ];
    rejectedReason = parts.join(" ");
  }

  return {
    productId: product.productId,
    eligible,
    checks,
    warnings,
    stockNotes,
    rejectionType,
    rejectedReason,
    failedChecks: failed.map((c) => c.checkId),
    unknownChecks: unknown.map((c) => c.checkId),
  };
}

/** Verifies a concrete quantity selection of one product (basket-level stock check). */
function verifyLineQuantity(product, quantity) {
  if (!Number.isInteger(quantity) || quantity < 1) {
    return { status: CHECK.FAIL, detail: `Invalid quantity ${quantity}.` };
  }
  if (product.stockQuantity === null) {
    return { status: CHECK.UNKNOWN, detail: `Stock for ${product.productId} is unknown.` };
  }
  if (quantity > product.stockQuantity) {
    return {
      status: CHECK.FAIL,
      detail: `Requested quantity ${quantity} exceeds available stock of ${product.stockQuantity} for ${product.productId}.`,
    };
  }
  return { status: CHECK.PASS, detail: `${quantity} of ${product.stockQuantity} in stock.` };
}

/**
 * Describes how trustworthy a product record is, independent of the checks.
 *   VERIFIED              source-backed and checked within VERIFIED_FRESHNESS_HOURS
 *   SOURCE_STALE          has a source but no recent check
 *   UNVERIFIED            real catalog data without a source
 *   UNVERIFIED_DEMO_DATA  synthetic demo record
 */
function describeEvidence(product, now = new Date()) {
  const origin = product.provenance?.dataOrigin || "CATALOG_UNCHECKED";
  const lookup = product.provenance?.sourceLookup || "NOT_CHECKED";
  const warnings = [];
  let status;

  if (origin === "SYNTHETIC_DEMO") {
    status = "UNVERIFIED_DEMO_DATA";
    warnings.push("Synthetic demo record: price, stock, delivery and scores are illustrative, not live retail data.");
  } else if (product.sourceUrl && product.lastCheckedISO && lookup === "FOUND") {
    const ageHours = (now.getTime() - Date.parse(product.lastCheckedISO)) / 36e5;
    if (ageHours >= 0 && ageHours <= VERIFIED_FRESHNESS_HOURS) {
      status = "VERIFIED";
    } else {
      status = "SOURCE_STALE";
      warnings.push(`Source last checked ${product.lastCheckedISO}; older than ${VERIFIED_FRESHNESS_HOURS}h, so details may have changed.`);
    }
  } else {
    status = "UNVERIFIED";
    if (lookup === "NOT_FOUND") warnings.push("Source lookup did not find this product.");
    else if (lookup === "UNAVAILABLE") warnings.push("Source lookup was unavailable; product details were not re-checked.");
    else warnings.push("Product details have not been checked against a live source.");
  }

  // Evidence completeness: share of evidence/soft fields that are actually known.
  const fields = [product.qualityScore, product.reliabilityScore, product.warrantyMonths, product.sourceUrl, product.lastCheckedISO];
  const evidenceCompleteness = fields.filter((v) => v !== null && v !== undefined).length / fields.length;

  return {
    status,
    dataOrigin: origin,
    sourceLookup: lookup,
    sourceUrl: product.sourceUrl ?? null,
    lastCheckedISO: product.lastCheckedISO ?? null,
    evidenceCompleteness,
    warnings,
  };
}

module.exports = { CHECK, VERIFIED_FRESHNESS_HOURS, verifyProduct, verifyLineQuantity, describeEvidence, categoryLabel };
