"use strict";

const { verifyProduct, verifyLineQuantity, CHECK } = require("./verifier");
const { toPaise, toRupees, formatINR } = require("./money");

/**
 * Pre-checkout revalidation.
 *
 * Re-checks one stored strategy against the CURRENT catalog right before the
 * user pays. Nothing is re-optimized; we only answer "is the basket the user
 * approved still exactly what they will get, at the price they approved?"
 *
 * Result status:
 *   VALID    every item still exists, passes every hard check, and the total is unchanged
 *   CHANGED  every item still passes, but a price or shipping amount moved
 *            (the total still fits the budget) -> the user must re-approve the new total
 *   INVALID  an item disappeared, failed a hard check (stock, delivery, spec,
 *            unknown data), or the new total exceeds the budget -> re-plan
 *
 * Only VALID should proceed to PayPal checkout without asking the user again.
 */

const REVALIDATION_STATUS = Object.freeze({ VALID: "VALID", CHANGED: "CHANGED", INVALID: "INVALID" });

async function revalidateStrategy({ plan, request }, strategyKey, catalogProvider, opts = {}) {
  const now = opts.now || new Date();
  const strategy = plan.strategies?.[strategyKey];
  if (!strategy) return null;

  const categories = [...new Set(strategy.items.map((i) => i.category))];
  const { products } = await catalogProvider.listProducts({ categories });
  const catalogMeta = catalogProvider.describe();
  const byId = new Map(products.map((p) => [p.productId, p]));

  const quantityByCategory = Object.fromEntries(request.requiredCategories.map((c) => [c.category, c.quantity]));
  const quantityByProduct = {};
  for (const i of strategy.items) quantityByProduct[i.productId] = (quantityByProduct[i.productId] || 0) + i.quantity;

  const problems = [];
  const changes = [];
  const items = [];
  let currentTotalPaise = 0;
  let computable = true;

  for (const item of strategy.items) {
    const product = byId.get(item.productId);
    if (!product) {
      problems.push({ productId: item.productId, check: "catalog.present", detail: `${item.name} is no longer in the catalog.` });
      computable = false;
      items.push({ productId: item.productId, name: item.name, quantity: item.quantity, status: "MISSING" });
      continue;
    }

    const v = verifyProduct(product, {
      categoryQuantity: quantityByCategory[item.category] ?? item.quantity,
      maxDeliveryDays: request.maxDeliveryDays,
      constraints: request.hardConstraints[item.category] || {},
    });
    for (const c of v.checks.filter((c) => c.mandatory && c.status !== CHECK.PASS)) {
      problems.push({ productId: item.productId, check: c.checkId, detail: `${item.name}: ${c.detail}` });
    }
    const stock = verifyLineQuantity(product, quantityByProduct[item.productId]);
    if (stock.status !== CHECK.PASS && v.eligible) {
      problems.push({ productId: item.productId, check: "stock.quantity", detail: `${item.name}: ${stock.detail}` });
    }

    let lineStatus = v.eligible && stock.status === CHECK.PASS ? "OK" : "FAILED";
    if (product.unitPriceINR === null || product.shippingINR === null) {
      computable = false;
    } else {
      for (const field of ["unitPriceINR", "shippingINR"]) {
        if (toPaise(product[field]) !== toPaise(item[field])) {
          changes.push({ productId: item.productId, field, before: item[field], after: product[field] });
          if (lineStatus === "OK") lineStatus = "PRICE_CHANGED";
        }
      }
      currentTotalPaise += toPaise(product.unitPriceINR) * item.quantity + toPaise(product.shippingINR);
    }
    items.push({
      productId: item.productId,
      name: product.name,
      quantity: item.quantity,
      status: lineStatus,
      approvedUnitPriceINR: item.unitPriceINR,
      currentUnitPriceINR: product.unitPriceINR,
      approvedShippingINR: item.shippingINR,
      currentShippingINR: product.shippingINR,
    });
  }

  const approvedTotalPaise = toPaise(strategy.totalINR);
  const budgetPaise = toPaise(request.budgetINR);
  if (computable && currentTotalPaise > budgetPaise) {
    problems.push({
      productId: null,
      check: "budget",
      detail: `The new total ${formatINR(currentTotalPaise)} exceeds the ${formatINR(budgetPaise)} budget.`,
    });
  }

  let status;
  if (problems.length || !computable) status = REVALIDATION_STATUS.INVALID;
  else if (changes.length || currentTotalPaise !== approvedTotalPaise) status = REVALIDATION_STATUS.CHANGED;
  else status = REVALIDATION_STATUS.VALID;

  const differencePaise = computable ? currentTotalPaise - approvedTotalPaise : null;
  return {
    planId: plan.planId,
    strategyKey,
    status,
    canProceedToCheckout: status === REVALIDATION_STATUS.VALID,
    approvedTotalINR: strategy.totalINR,
    currentTotalINR: computable ? toRupees(currentTotalPaise) : null,
    differenceINR: differencePaise === null ? null : toRupees(differencePaise),
    budgetINR: request.budgetINR,
    summary: summarize(status, differencePaise, problems),
    changes,
    problems,
    items,
    catalog: { catalogId: catalogMeta.catalogId, catalogVersion: catalogMeta.catalogVersion, dataOrigin: catalogMeta.dataOrigin },
    checkedAtISO: now.toISOString(),
  };
}

function summarize(status, differencePaise, problems) {
  if (status === REVALIDATION_STATUS.VALID) return "Every item still passes all hard checks at the approved total.";
  if (status === REVALIDATION_STATUS.CHANGED) {
    const dir = differencePaise > 0 ? "increased" : differencePaise < 0 ? "decreased" : "changed";
    const amount = differencePaise ? ` by ${formatINR(Math.abs(differencePaise))}` : "";
    return `Prices changed: the total ${dir}${amount}. Ask the user to re-approve before checkout.`;
  }
  return `This basket can no longer be bought as approved: ${problems.map((p) => p.detail).join(" ")} Generate a new plan.`;
}

module.exports = { revalidateStrategy, REVALIDATION_STATUS };
