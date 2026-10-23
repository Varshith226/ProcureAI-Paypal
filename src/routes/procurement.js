"use strict";

const express = require("express");
const { buildPlan } = require("../planService");
const { ValidationError } = require("../requestValidator");
const { CatalogUnavailableError, createJsonFileCatalogProvider } = require("../catalogProvider");
const { describeSupportedConstraints } = require("../constraintRegistry");
const { SCORING_DESCRIPTION } = require("../scoring");

/**
 * Procurement routes (mounted at /api/procurement in server.js).
 *
 *   POST /api/procurement/plan      canonical request JSON -> plan response (DRAFT or INFEASIBLE)
 *   GET  /api/procurement/catalog   catalog metadata + products (optional ?category=monitor)
 *   GET  /api/procurement/contract  supported hard constraints and scoring rules
 *
 * These routes only prepare plans. They never call PayPal.
 */
function createProcurementRouter({ catalogProvider = createJsonFileCatalogProvider() } = {}) {
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
      const plan = await buildPlan(req.body, catalogProvider);
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

function sendError(res, error) {
  if (error instanceof ValidationError) {
    return res.status(400).json({ error: "INVALID_REQUEST", message: "The procurement request is invalid.", details: error.errors });
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
