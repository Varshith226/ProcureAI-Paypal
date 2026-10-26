"use strict";

const { planStore } = require("./planStore");
const { revalidateStrategy } = require("./revalidator");
const { createJsonFileCatalogProvider, createDemoOverlayProvider } = require("./catalogProvider");

/**
 * In-process helpers for the PayPal approve / create-order routes in server.js.
 *
 * They use the SAME plan store and catalog (including demo overrides) as the
 * /api/procurement routes, so what the API reports and what checkout enforces
 * can never disagree.
 *
 *   const { getApprovedStrategy, revalidateForCheckout } = require("./src/checkoutGuard");
 *
 *   // in /api/plans/:planId/approve — take prices from the server, not the browser
 *   const strategy = getApprovedStrategy(planId, strategyKey);   // null if unknown
 *
 *   // in /api/paypal/create-order — right before calling PayPal
 *   const check = await revalidateForCheckout(planId, strategyKey);
 *   if (!check || !check.canProceedToCheckout) return res.status(409).json({ error: "...", revalidation: check });
 */

const defaultCatalogProvider = createDemoOverlayProvider(createJsonFileCatalogProvider());

/** Server-stored strategy (frozen) for a generated plan, or null. */
function getApprovedStrategy(planId, strategyKey) {
  return planStore.getStrategy(planId, strategyKey);
}

/** VALID | CHANGED | INVALID result for the stored strategy, or null if the plan/strategy is unknown. */
async function revalidateForCheckout(planId, strategyKey) {
  const entry = planStore.get(planId);
  if (!entry) return null;
  return revalidateStrategy(entry, strategyKey, defaultCatalogProvider);
}

module.exports = { defaultCatalogProvider, getApprovedStrategy, revalidateForCheckout };
