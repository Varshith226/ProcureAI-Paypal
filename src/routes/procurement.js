"use strict";

const express = require("express");
const { buildPlanDetailed } = require("../planService");
const { planStore: defaultPlanStore } = require("../planStore");
const { revalidateStrategy } = require("../revalidator");
const { ValidationError } = require("../requestValidator");
const { CatalogUnavailableError, DemoOverrideError } = require("../catalogProvider");
const { defaultCatalogProvider } = require("../checkoutGuard");
const { describeSupportedConstraints } = require("../constraintRegistry");
const { SCORING_DESCRIPTION } = require("../scoring");

/**
 * Procurement routes (mounted at /api/procurement in server.js).
 *
 *   POST /api/procurement/plan      canonical request JSON -> plan response (DRAFT or INFEASIBLE)
 *   GET  /api/procurement/catalog   catalog metadata + products (optional ?category=monitor)
 *   GET  /api/procurement/contract  supported hard constraints and scoring rules
 *   GET  /api/procurement/plans/:planId                 server-stored copy of a generated plan
 *   GET  /api/procurement/plans/:planId/strategies/:key one stored strategy (server-trusted prices)
 *   POST /api/procurement/plans/:planId/revalidate      { strategyKey } -> VALID | CHANGED | INVALID
 *
 * Demo only (refused unless the catalog is SYNTHETIC_DEMO; disable with PROCUREMENT_DEMO_ROUTES=off):
 *   GET    /api/procurement/demo/catalog-overrides
 *   POST   /api/procurement/demo/catalog-overrides { productId, unitPriceINR?, shippingINR?, stockQuantity?, deliveryDays? }
 *   DELETE /api/procurement/demo/catalog-overrides
 *
 * These routes only prepare and re-check plans. They never call PayPal.
 */
function createProcurementRouter({
  catalogProvider = defaultCatalogProvider, // shared with src/checkoutGuard.js
  planStore = defaultPlanStore,
  enableDemoRoutes = process.env.PROCUREMENT_DEMO_ROUTES !== "off",
} = {}) {
  const router = express.Router();

  router.post("/plan", async (req, res) => {
    if (req.body === undefined) {
      return res.status(400).json({
        error: "INVALID_REQUEST",
        message: "Request body must be JSON (Content-Type: application/json).",
        details: [{ field: "(body)", message: "missing or non-JSON body" }],
      });
    }
    try {
      const { plan, request } = await buildPlanDetailed(req.body, catalogProvider);
      planStore.save(plan, request);
      return res.status(200).json(plan);
    } catch (error) {
      return sendError(res, error);
    }
  });

  router.get("/catalog", async (req, res) => {
    try {
      const category = typeof req.query.category === "string" ? req.query.category.trim().toLowerCase() : null;
      const { products, loadWarnings } = await catalogProvider.listProducts(category ? { categories: [category] } : {});
      return res.json({ catalog: catalogProvider.describe(), count: products.length, loadWarnings, products });
    } catch (error) {
      return sendError(res, error);
    }
  });

  router.get("/plans/:planId", (req, res) => {
    const entry = planStore.get(req.params.planId);
    if (!entry) return planNotFound(res, req.params.planId);
    return res.json(entry.plan);
  });

  router.get("/plans/:planId/strategies/:strategyKey", (req, res) => {
    const { planId, strategyKey } = req.params;
    if (!planStore.get(planId)) return planNotFound(res, planId);
    const strategy = planStore.getStrategy(planId, strategyKey);
    if (!strategy) return strategyNotFound(res, planId, strategyKey);
    return res.json(strategy);
  });

  router.post("/plans/:planId/revalidate", async (req, res) => {
    const { planId } = req.params;
    const strategyKey = req.body?.strategyKey;
    if (typeof strategyKey !== "string" || !strategyKey) {
      return res.status(400).json({
        error: "INVALID_REQUEST",
        message: "strategyKey is required.",
        details: [{ field: "strategyKey", message: "is required (e.g. BEST_VALUE)" }],
      });
    }
    const entry = planStore.get(planId);
    if (!entry) return planNotFound(res, planId);
    try {
      const result = await revalidateStrategy(entry, strategyKey, catalogProvider);
      if (!result) return strategyNotFound(res, planId, strategyKey);
      return res.json(result);
    } catch (error) {
      return sendError(res, error);
    }
  });

  if (enableDemoRoutes && typeof catalogProvider.setOverride === "function") {
    router.get("/demo/catalog-overrides", (req, res) => res.json({ overrides: catalogProvider.listOverrides() }));
    router.post("/demo/catalog-overrides", async (req, res) => {
      const { productId, ...changes } = req.body || {};
      if (typeof productId !== "string" || !productId) {
        return res.status(400).json({
          error: "INVALID_REQUEST",
          message: "productId is required.",
          details: [{ field: "productId", message: "is required" }],
        });
      }
      try {
        const result = await catalogProvider.setOverride(productId, changes);
        return res.json({ ...result, note: "Demo override active. Call /plans/:planId/revalidate to see its effect." });
      } catch (error) {
        return sendError(res, error);
      }
    });
    router.delete("/demo/catalog-overrides", (req, res) => {
      catalogProvider.clearOverrides();
      return res.json({ overrides: {} });
    });
  }

  router.get("/contract", (req, res) => {
    res.json({
      endpoint: "POST /api/procurement/plan",
      supportedHardConstraints: describeSupportedConstraints(),
      scoring: SCORING_DESCRIPTION,
      planStatuses: ["DRAFT", "INFEASIBLE"],
      strategies: ["CHEAPEST", "BEST_VALUE", "ALTERNATIVE"],
    });
  });

  return router;
}

function planNotFound(res, planId) {
  return res.status(404).json({
    error: "PLAN_NOT_FOUND",
    message: `No plan '${planId}' on this server. Plans are kept in memory, so generate it again with POST /api/procurement/plan after a restart.`,
  });
}

function strategyNotFound(res, planId, strategyKey) {
  return res.status(404).json({
    error: "STRATEGY_NOT_FOUND",
    message: `Plan '${planId}' has no strategy '${strategyKey}'.`,
  });
}

function sendError(res, error) {
  if (error instanceof ValidationError) {
    return res.status(400).json({ error: "INVALID_REQUEST", message: "The procurement request is invalid.", details: error.errors });
  }
  if (error instanceof DemoOverrideError) {
    return res.status(error.statusCode).json({ error: "DEMO_OVERRIDE_REJECTED", message: error.message });
  }
  if (error instanceof CatalogUnavailableError) {
    return res.status(503).json({ error: "CATALOG_UNAVAILABLE", message: error.message });
  }
  console.error("[procurement] unexpected error:", error);
  return res.status(500).json({ error: "INTERNAL_ERROR", message: "Could not build a procurement plan." });
}

/**
 * express.json() runs before the router, so a malformed JSON body never reaches
 * it. Mount this error handler on the same path to return a JSON 400 instead of
 * Express's default HTML error page. Other errors are passed through untouched.
 */
// eslint-disable-next-line no-unused-vars
function procurementJsonErrorHandler(err, req, res, next) {
  if (err && err.type === "entity.parse.failed") {
    return res.status(400).json({
      error: "INVALID_REQUEST",
      message: "Request body is not valid JSON.",
      details: [{ field: "(body)", message: err.message }],
    });
  }
  return next(err);
}

module.exports = { createProcurementRouter, procurementJsonErrorHandler };
