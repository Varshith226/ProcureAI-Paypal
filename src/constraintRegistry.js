"use strict";

/**
 * Registry of hard constraints the verifier knows how to check.
 *
 * A request may only use constraint keys listed here. Unknown keys are
 * rejected by the request validator instead of being silently ignored,
 * because an unchecked "hard" constraint would make the plan dishonest.
 *
 * Rule kinds:
 *   min      product value must be >= constraint value      (number)
 *   max      product value must be <= constraint value      (number)
 *   in       product value must be one of the listed values (non-empty string[])
 *   notIn    product value must not be one of the values    (non-empty string[])
 *   equals   product value must equal the constraint value  (boolean)
 *
 * `field` is a path on the product record ("specs.refreshRateHz", "brand", ...).
 * String comparisons for `in` / `notIn` are case-insensitive.
 */

const COMMON_RULES = {
  minWarrantyMonths: { kind: "min", field: "warrantyMonths", label: "warranty", unit: "months" },
  maxUnitPriceINR: { kind: "max", field: "unitPriceINR", label: "unit price", unit: "INR" },
  allowedBrands: { kind: "in", field: "brand", label: "brand" },
  excludedBrands: { kind: "notIn", field: "brand", label: "brand" },
};

const CATEGORY_RULES = {
  monitor: {
    minRefreshRateHz: { kind: "min", field: "specs.refreshRateHz", label: "refresh rate", unit: "Hz" },
    minSizeInches: { kind: "min", field: "specs.sizeInches", label: "screen size", unit: "inches" },
    maxSizeInches: { kind: "max", field: "specs.sizeInches", label: "screen size", unit: "inches" },
    panelIn: { kind: "in", field: "specs.panel", label: "panel type" },
    resolutionIn: { kind: "in", field: "specs.resolution", label: "resolution" },
  },
  keyboard: {
    connectivityIn: { kind: "in", field: "specs.connectivity", label: "connectivity" },
    layoutIn: { kind: "in", field: "specs.layout", label: "layout" },
    switchTypeIn: { kind: "in", field: "specs.switchType", label: "switch type" },
  },
  mouse: {
    connectivityIn: { kind: "in", field: "specs.connectivity", label: "connectivity" },
    maxWeightGrams: { kind: "max", field: "specs.weightGrams", label: "weight", unit: "g" },
    minDpi: { kind: "min", field: "specs.dpi", label: "sensor DPI", unit: "DPI" },
  },
  headphones: {
    connectivityIn: { kind: "in", field: "specs.connectivity", label: "connectivity" },
    typeIn: { kind: "in", field: "specs.type", label: "headphone type" },
    requireAnc: { kind: "equals", field: "specs.anc", label: "active noise cancellation" },
  },
};

function rulesForCategory(category) {
  return { ...COMMON_RULES, ...(CATEGORY_RULES[category] || {}) };
}

function getRule(category, key) {
  return rulesForCategory(category)[key] || null;
}

/** Validates one constraint value against its rule kind. Returns an error string or null. */
function validateConstraintValue(rule, value) {
  switch (rule.kind) {
    case "min":
    case "max":
      return typeof value === "number" && Number.isFinite(value) && value >= 0
        ? null
        : "must be a finite, non-negative number";
    case "in":
    case "notIn":
      return Array.isArray(value) &&
        value.length > 0 &&
        value.every((v) => typeof v === "string" && v.trim() !== "")
        ? null
        : "must be a non-empty array of non-empty strings";
    case "equals":
      return typeof value === "boolean" ? null : "must be a boolean";
    default:
      return `unsupported rule kind '${rule.kind}'`;
  }
}

/** JSON-friendly description of every supported constraint, for docs/contract endpoints. */
function describeSupportedConstraints() {
  const describe = (rules) =>
    Object.fromEntries(
      Object.entries(rules).map(([key, r]) => [key, { kind: r.kind, field: r.field, unit: r.unit || null }])
    );
  return {
    anyCategory: describe(COMMON_RULES),
    ...Object.fromEntries(Object.entries(CATEGORY_RULES).map(([c, rules]) => [c, describe(rules)])),
  };
}

module.exports = { getRule, rulesForCategory, validateConstraintValue, describeSupportedConstraints };
