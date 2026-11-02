"use strict";

const express = require("express");
const { createAIService } = require("../aiService");
const { AIServiceError } = require("../aiErrors");
const { DEFAULT_MODEL } = require("../geminiExtractor");
const { EXTRACTION_SCHEMA } = require("../requestExtraction");

function createAIRouter({ service = createAIService() } = {}) {
  const router = express.Router();
  router.get("/status", (req, res) => res.json({
    configured: Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== "your-gemini-api-key"),
    provider: "gemini", model: process.env.GEMINI_MODEL || DEFAULT_MODEL,
    contractVersion: 3, parsesAnyCategory: true, scope: "REQUEST_INTELLIGENCE",
  }));
  router.get("/contract", (req, res) => res.json({
    contractVersion: 3,
    input: { messages: "1..100 user strings; <=8000 characters each, <=16000 total", requestId: "optional string <=128 characters" },
    requirementsSchema: EXTRACTION_SCHEMA,
    completedRequestSchema: require("../../shared/request-intelligence.schema.json"),
    statuses: ["READY", "NEEDS_CLARIFICATION", "NOT_PROCUREMENT", "CANCELLED"],
    legacyPlanEndpoint: "/api/ai/plan (separate optional v1 integration, outside parsing readiness)",
    note: "READY means the user's purchasing requirements are clear. It does not depend on products, catalogs, currencies or optimizer capabilities. request contains the complete general JSON; requirements preserves partial data while clarifying. No payment actions are performed.",
  }));
  for (const action of ["parse", "plan"]) {
    router.post(`/${action}`, async (req, res) => {
      try {
        return res.json(await service[action](req.body));
      } catch (error) {
        if (error instanceof AIServiceError) {
          return res.status(error.statusCode).json({ error: error.code, message: error.message, details: error.details });
        }
        if (error?.name === "CatalogUnavailableError") {
          return res.status(503).json({ error: "CATALOG_UNAVAILABLE", message: "The product catalog is unavailable. Try again later." });
        }
        // Avoid logging prompts, raw provider responses or credentials.
        console.error("[request-intelligence] unexpected error:", error.name);
        return res.status(500).json({ error: "INTERNAL_ERROR", message: "Could not prepare the purchasing request." });
      }
    });
  }
  return router;
}

function aiJsonErrorHandler(error, req, res, next) {
  if (error?.type === "entity.parse.failed" || error?.type === "entity.too.large") {
    return res.status(error.type === "entity.too.large" ? 413 : 400).json({
      error: "INVALID_AI_REQUEST", message: error.type === "entity.too.large" ? "Request body is too large." : "Request body must be valid JSON.",
    });
  }
  return next(error);
}

module.exports = { createAIRouter, aiJsonErrorHandler };
