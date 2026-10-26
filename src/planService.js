"use strict";

const crypto = require("node:crypto");
const { validateRequest, ValidationError } = require("./requestValidator");
const { verifyProduct, verifyLineQuantity, describeEvidence, categoryLabel, CHECK } = require("./verifier");
const { unitScores, round, SCORING_DESCRIPTION } = require("./scoring");
const { optimize, categoriesChanged } = require("./optimizer");
const { toPaise, toRupees, formatINR } = require("./money");

/**
 * Pipeline: Request JSON -> Catalog -> Verification -> Basket optimization -> Plan response.
 * This module only PREPARES a plan. It never creates, authorizes or captures a payment.
 */

const PLAN_SCHEMA_VERSION = 1;

const STRATEGY_META = {
  CHEAPEST: {
    strategyName: "Plan A — Cheapest",
    objectiveSummary:
      "Lowest total cost among complete baskets that meet every hard constraint and the budget; higher composite score breaks ties.",
    itemReason: "Part of the lowest-cost complete basket that meets every hard constraint.",
  },
  BEST_VALUE: {
    strategyName: "Plan B — Best Value",
    objectiveSummary:
      "Highest weighted quality, reliability and delivery score among complete baskets within budget; the lower total wins ties. Price is a budget limit and tie-breaker, not part of the score.",
    itemReason: "Part of the highest-scoring complete basket within budget.",
  },
  ALTERNATIVE: {
    strategyName: "Plan C — Alternative",
    objectiveSummary:
      "Highest-scoring complete basket that changes at least two category picks versus Best Value and is cheaper or better evidenced.",
    itemReason: "Chosen for the alternative trade-off basket.",
  },
};

function stableHash(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 12);
}

/**
 * @param {object} body           raw request JSON
 * @param {object} catalogProvider see catalogProvider.js
 * @param {object} [opts]         { now: Date } for evidence freshness (tests)
 * @throws ValidationError for invalid requests, CatalogUnavailableError if the catalog cannot load
 */
async function buildPlan(body, catalogProvider, opts = {}) {
  return (await buildPlanDetailed(body, catalogProvider, opts)).plan;
}

/** Same as buildPlan, but also returns the validated request: { plan, request }. */
async function buildPlanDetailed(body, catalogProvider, opts = {}) {
  const now = opts.now || new Date();
  const validation = validateRequest(body);
  if (!validation.ok) throw new ValidationError(validation.errors);
  const req = validation.value;
  const planWarnings = [...validation.warnings];

  const categories = req.requiredCategories.map((c) => c.category);
  const { products, loadWarnings } = await catalogProvider.listProducts({ categories });
  const catalogMeta = catalogProvider.describe();
  planWarnings.push(...loadWarnings);

  const budgetPaise = toPaise(req.budgetINR);

  // ---- Verification -------------------------------------------------------
  const verificationById = new Map();
  const rejectedProducts = [];
  const categoryInputs = req.requiredCategories.map(({ category, quantity }) => {
    const inCategory = products.filter((p) => p.category === category);
    const candidates = [];
    for (const product of inCategory) {
      const v = verifyProduct(product, {
        categoryQuantity: quantity,
        maxDeliveryDays: req.maxDeliveryDays,
        constraints: req.hardConstraints[category] || {},
      });
      const evidence = describeEvidence(product, now);
      verificationById.set(product.productId, { v, evidence, product });
      if (!v.eligible) {
        rejectedProducts.push({
          productId: product.productId,
          name: product.name,
          category: product.category,
          unitPriceINR: product.unitPriceINR,
          rejectedReason: v.rejectedReason,
          rejectionType: v.rejectionType,
          failedChecks: v.failedChecks,
          unknownChecks: v.unknownChecks,
          dataOrigin: evidence.dataOrigin,
        });
        continue;
      }
      candidates.push({
        product,
        unitPaise: toPaise(product.unitPriceINR),
        shippingPaise: toPaise(product.shippingINR),
        scores: unitScores(product, req.weights, req.maxDeliveryDays),
        evidenceCompleteness: evidence.evidenceCompleteness,
      });
    }
    return { category, quantity, candidates, catalogCount: inCategory.length };
  });

  // ---- Optimization -------------------------------------------------------
  const result = optimize(categoryInputs, budgetPaise);

  const base = {
    // Hash covers the request AND the exact product data used, so a price/stock edit
    // yields a new planId and never silently overwrites a plan a user already saw.
    planId: `plan_${stableHash({ r: req, c: catalogMeta.catalogId, v: catalogMeta.catalogVersion, p: products })}`,
    version: PLAN_SCHEMA_VERSION,
    requestId: req.requestId,
    rawQuery: req.rawQuery,
    currency: "INR",
    budgetINR: req.budgetINR,
    catalog: {
      catalogId: catalogMeta.catalogId,
      catalogVersion: catalogMeta.catalogVersion,
      dataOrigin: catalogMeta.dataOrigin,
      disclaimer: catalogMeta.disclaimer,
    },
    scoring: { weights: req.weights, weightsSource: req.weightsSource, ...SCORING_DESCRIPTION },
  };

  if (catalogMeta.dataOrigin === "SYNTHETIC_DEMO") {
    planWarnings.push("All products come from a synthetic demo catalog; prices, stock and delivery are not live retail data.");
  }

  if (!result.feasible) {
    const plan = {
      ...base,
      status: "INFEASIBLE",
      strategies: {},
      omittedStrategies: [],
      infeasibility: explainInfeasibility(req, categoryInputs, result, budgetPaise),
      warnings: planWarnings,
      rejectedProducts,
      search: result.search,
    };
    return { plan, request: req };
  }

  const strategies = {};
  const ordered = [
    ["CHEAPEST", result.cheapest],
    ["BEST_VALUE", result.bestValue],
    ["ALTERNATIVE", result.alternative],
  ];
  const topByCategory = topScoringCandidates(categoryInputs);
  for (const [key, basket] of ordered) {
    if (!basket) continue;
    strategies[key] = buildStrategy(key, basket, { req, budgetPaise, verificationById, topByCategory, result });
  }
  if (!result.search.exhaustive) planWarnings.push(...result.search.notes);

  const plan = {
    ...base,
    status: "DRAFT",
    strategies,
    omittedStrategies: result.omitted,
    infeasibility: null,
    warnings: planWarnings,
    rejectedProducts,
    search: result.search,
  };
  return { plan, request: req };
}

function topScoringCandidates(categoryInputs) {
  const top = {};
  for (const c of categoryInputs) {
    const sorted = [...c.candidates].sort(
      (a, b) => b.scores.composite - a.scores.composite || (a.product.productId < b.product.productId ? -1 : 1)
    );
    top[c.category] = sorted[0] || null;
  }
  return top;
}

function buildStrategy(strategyKey, basket, ctx) {
  const { req, budgetPaise, verificationById, topByCategory, result } = ctx;
  const meta = STRATEGY_META[strategyKey];
  const items = [];
  const strategyWarnings = new Set();
  let subtotalPaise = 0;
  let shippingPaise = 0;

  for (const sel of basket.selections) {
    for (const line of sel.option.lines) {
      const { product, unitPaise, shippingPaise: linePaise, scores } = line.cand;
      const { v, evidence } = verificationById.get(product.productId);
      const lineTotalPaise = unitPaise * line.quantity + linePaise;
      subtotalPaise += unitPaise * line.quantity;
      shippingPaise += linePaise;

      const passedSpecs = v.checks.filter((c) => c.group === "SPEC" && c.status === CHECK.PASS).map((c) => c.detail);
      const reasonParts = [];
      if (passedSpecs.length) reasonParts.push(passedSpecs.join(" "));
      reasonParts.push(
        `Delivers in ${product.deliveryDays} day(s); quality ${fmtScore(product.qualityScore)}, reliability ${fmtScore(product.reliabilityScore)}.`
      );
      reasonParts.push(meta.itemReason);
      const top = topByCategory[sel.category];
      if (strategyKey === "BEST_VALUE" && top && top.product.productId !== product.productId && sel.option.lines.length === 1) {
        reasonParts.push(
          `The top-scoring eligible ${sel.category} (${top.product.name}) was not used because no complete basket containing it scores higher within the ${formatINR(budgetPaise)} budget.`
        );
      }

      const itemWarnings = [...v.warnings, ...evidence.warnings];
      // Product-specific data gaps bubble up to the plan; the generic demo-data
      // warning is added once per plan instead of once per item.
      v.warnings.forEach((w) => strategyWarnings.add(`${product.productId}: ${w}`));
      if (evidence.dataOrigin !== "SYNTHETIC_DEMO") {
        evidence.warnings.forEach((w) => strategyWarnings.add(`${product.productId}: ${w}`));
      }

      items.push({
        productId: product.productId,
        name: product.name,
        brand: product.brand,
        category: product.category,
        quantity: line.quantity,
        unitPriceINR: toRupees(unitPaise),
        shippingINR: toRupees(linePaise),
        lineTotalINR: toRupees(lineTotalPaise),
        deliveryDays: product.deliveryDays,
        warrantyMonths: product.warrantyMonths,
        specs: product.specs,
        specsSummary: summarizeSpecs(product.specs),
        scores: {
          quality: product.qualityScore,
          reliability: product.reliabilityScore,
          delivery: round(scores.delivery),
          composite: round(scores.composite),
        },
        selectionReason: reasonParts.join(" "),
        verification: {
          status: evidence.status,
          dataOrigin: evidence.dataOrigin,
          sourceLookup: evidence.sourceLookup,
          checksPassed: v.checks.filter((c) => c.status === CHECK.PASS).map((c) => c.detail),
          warnings: itemWarnings,
          sourceUrl: evidence.sourceUrl,
          lastCheckedISO: evidence.lastCheckedISO,
        },
      });
    }
  }

  const totalPaise = subtotalPaise + shippingPaise;
  const constraintSummary = summarizeConstraints(basket, req, totalPaise, budgetPaise, verificationById);
  assertIntegrity(strategyKey, items, totalPaise, basket.costPaise, budgetPaise, constraintSummary);

  const demoItems = items.filter((i) => i.verification.dataOrigin === "SYNTHETIC_DEMO").length;
  if (demoItems > 0) {
    strategyWarnings.add(
      `${demoItems === items.length ? "Every item" : `${demoItems} of ${items.length} items`} in this plan is synthetic demo data — confirm real prices, stock and delivery before paying.`
    );
  }

  const strategy = {
    strategyKey,
    strategyName: meta.strategyName,
    objectiveSummary: meta.objectiveSummary,
    subtotalINR: toRupees(subtotalPaise),
    shippingTotalINR: toRupees(shippingPaise),
    totalINR: toRupees(totalPaise),
    leftoverBudgetINR: toRupees(budgetPaise - totalPaise),
    withinBudget: totalPaise <= budgetPaise,
    paypalSettlementUSD: null, // set only by the PayPal/FX flow — never estimated here
    compositeScore: round(basket.score),
    scoreBreakdown: {
      quality: round(basket.breakdown.quality),
      reliability: round(basket.breakdown.reliability),
      delivery: round(basket.breakdown.delivery),
    },
    verificationLevel: overallVerification(items),
    constraintSummary,
    warnings: [...strategyWarnings],
    items,
  };

  if (strategyKey === "ALTERNATIVE") strategy.tradeOff = describeTradeOff(basket, result.bestValue);
  return strategy;
}

const SPEC_FORMATTERS = {
  refreshRateHz: (v) => `${v} Hz`,
  sizeInches: (v) => `${v}"`,
  weightGrams: (v) => `${v} g`,
  dpi: (v) => `${Number(v).toLocaleString("en-IN")} DPI`,
  anc: (v) => (v ? "ANC" : "No ANC"),
};

/** Display string for specs, e.g. '170 Hz · IPS · 1440p · 27"'. Unknown (null) specs are skipped. */
function summarizeSpecs(specs) {
  return Object.entries(specs || {})
    .filter(([, v]) => v !== null && v !== undefined && v !== "")
    .map(([k, v]) => (SPEC_FORMATTERS[k] ? SPEC_FORMATTERS[k](v) : String(v)))
    .join(" · ");
}

function fmtScore(s) {
  return s === null ? "unknown" : s.toFixed(2);
}

function overallVerification(items) {
  const statuses = new Set(items.map((i) => i.verification.status));
  if (statuses.size === 1) return [...statuses][0];
  if (statuses.has("UNVERIFIED_DEMO_DATA")) return "UNVERIFIED_DEMO_DATA";
  if (statuses.has("UNVERIFIED")) return "UNVERIFIED";
  return "SOURCE_STALE";
}

/** Recomputes every hard check on the FINAL basket instead of assuming them. */
function summarizeConstraints(basket, req, totalPaise, budgetPaise, verificationById) {
  const pass = (ok) => (ok ? "PASSED" : "FAILED");
  const qtyByCategory = {};
  const qtyByProduct = {};
  const productChecks = [];
  for (const sel of basket.selections) {
    for (const line of sel.option.lines) {
      qtyByCategory[sel.category] = (qtyByCategory[sel.category] || 0) + line.quantity;
      qtyByProduct[line.cand.product.productId] = (qtyByProduct[line.cand.product.productId] || 0) + line.quantity;
      productChecks.push(...verificationById.get(line.cand.product.productId).v.checks);
    }
  }
  const coverage = req.requiredCategories.every((c) => qtyByCategory[c.category] === c.quantity);
  const stock = Object.entries(qtyByProduct).every(
    ([id, q]) => verifyLineQuantity(verificationById.get(id).product, q).status === CHECK.PASS
  );
  const groupOk = (g) => productChecks.filter((c) => c.group === g).every((c) => c.status === CHECK.PASS);
  return {
    budgetCheck: pass(totalPaise <= budgetPaise),
    categoryCoverageCheck: pass(coverage),
    mandatorySpecCheck: pass(groupOk("SPEC")),
    deliveryCheck: pass(groupOk("DELIVERY")),
    stockCheck: pass(stock),
    priceDataCheck: pass(groupOk("PRICE")),
  };
}

/** Internal invariant check. A failure here is a bug, never something to show the user as a plan. */
function assertIntegrity(strategyKey, items, totalPaise, optimizerCostPaise, budgetPaise, summary) {
  const fromItems = items.reduce((s, i) => s + toPaise(i.lineTotalINR), 0);
  const problems = [];
  if (fromItems !== totalPaise) problems.push(`line totals ${fromItems} != total ${totalPaise}`);
  if (optimizerCostPaise !== totalPaise) problems.push(`optimizer cost ${optimizerCostPaise} != total ${totalPaise}`);
  if (totalPaise > budgetPaise) problems.push("total exceeds budget");
  for (const i of items) {
    if (toPaise(i.unitPriceINR) * i.quantity + toPaise(i.shippingINR) !== toPaise(i.lineTotalINR)) {
      problems.push(`${i.productId} line arithmetic mismatch`);
    }
  }
  const failed = Object.entries(summary).filter(([, s]) => s !== "PASSED").map(([k]) => k);
  if (failed.length) problems.push(`constraint checks failed: ${failed.join(", ")}`);
  if (problems.length) throw new Error(`Plan integrity check failed for ${strategyKey}: ${problems.join("; ")}`);
}

function describeTradeOff(alt, best) {
  const changed = categoriesChanged(alt, best);
  const diffPaise = best.costPaise - alt.costPaise;
  const scoreDelta = round(alt.score - best.score);
  const pieces = [`Changes the ${changed.join(", ")} pick(s) versus Best Value.`];
  if (diffPaise > 0) pieces.push(`Costs ${formatINR(diffPaise)} less`);
  else if (diffPaise < 0) pieces.push(`Costs ${formatINR(-diffPaise)} more`);
  else pieces.push("Costs the same");
  pieces[pieces.length - 1] += ` with a composite score ${scoreDelta >= 0 ? "+" : ""}${scoreDelta} relative to Best Value.`;
  if (alt.evidence > best.evidence + 1e-9) pieces.push("Its products have more complete evidence.");
  return {
    categoriesChanged: changed,
    costDifferenceINR: toRupees(alt.costPaise - best.costPaise),
    compositeScoreDifference: scoreDelta,
    summary: pieces.join(" "),
  };
}

function explainInfeasibility(req, categoryInputs, result, budgetPaise) {
  const reasons = [];
  const categoryDiagnostics = categoryInputs.map((c) => {
    const eligibleStock = c.candidates.reduce((s, cand) => s + cand.product.stockQuantity, 0);
    return {
      category: c.category,
      quantityRequired: c.quantity,
      productsInCatalog: c.catalogCount,
      eligibleProducts: c.candidates.length,
      eligibleUnitsInStock: eligibleStock,
    };
  });

  for (const d of categoryDiagnostics) {
    const label = categoryLabel(d.category);
    if (d.productsInCatalog === 0) {
      reasons.push(`${label}: the catalog has no products in this category.`);
    } else if (d.eligibleProducts === 0) {
      reasons.push(`${label}: none of the ${d.productsInCatalog} catalog product(s) pass every hard constraint (see rejectedProducts).`);
    } else if (d.eligibleUnitsInStock < d.quantityRequired) {
      reasons.push(
        `${label}: ${d.quantityRequired} unit(s) required but eligible products have only ${d.eligibleUnitsInStock} unit(s) in stock combined.`
      );
    }
  }

  let cheapestPossibleTotalINR = null;
  if (result.minimumPossibleCostPaise !== null && result.minimumPossibleCostPaise > budgetPaise) {
    cheapestPossibleTotalINR = toRupees(result.minimumPossibleCostPaise);
    reasons.push(
      `The cheapest complete basket of eligible products costs ${formatINR(result.minimumPossibleCostPaise)}, which exceeds the ${formatINR(budgetPaise)} budget by ${formatINR(result.minimumPossibleCostPaise - budgetPaise)}.`
    );
  }
  if (!reasons.length) reasons.push("No complete basket satisfies every hard constraint within the budget.");

  return {
    reasons,
    cheapestPossibleTotalINR,
    cheapestByCategoryINR: result.cheapestByCategory
      ? Object.fromEntries(result.cheapestByCategory.map((c) => [c.category, toRupees(c.costPaise)]))
      : null,
    categoryDiagnostics,
    suggestions: buildSuggestions(categoryDiagnostics, cheapestPossibleTotalINR, req),
  };
}

function buildSuggestions(diags, cheapestTotal, req) {
  const s = [];
  if (cheapestTotal !== null) s.push(`Raise the budget to at least ₹${cheapestTotal.toLocaleString("en-IN")} or drop a category.`);
  if (diags.some((d) => d.productsInCatalog > 0 && d.eligibleProducts === 0)) {
    s.push(`Relax a hard constraint or the ${req.maxDeliveryDays}-day delivery limit for the blocked category.`);
  }
  if (diags.some((d) => d.eligibleProducts > 0 && d.eligibleUnitsInStock < d.quantityRequired)) {
    s.push("Reduce the requested quantity.");
  }
  return s;
}

module.exports = { buildPlan, buildPlanDetailed, summarizeSpecs, STRATEGY_META, PLAN_SCHEMA_VERSION };
