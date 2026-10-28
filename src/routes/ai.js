"use strict";

const express = require("express");
const { createAIService } = require("../aiService");
const { AIServiceError } = require("../aiErrors");
const { CatalogUnavailableError } = require("../catalogProvider");
const { DEFAULT_MODEL } = require("../geminiExtractor");
const { SUPPORTED_CATEGORIES } = require("../requestExtraction");

function createAIRouter({ service = createAIService() } = {}) {
  const router = express.Router();
  router.get("/status", (req, res) => res.json({
    configured: Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== "your-gemini-api-key"),
    provider: "gemini", model: process.env.GEMINI_MODEL || DEFAULT_MODEL,
    supportedCategories: SUPPORTED_CATEGORIES,
  }));
  for (const action of ["parse", "plan"]) {
    router.post(`/${action}`, async (req, res) => {
      try {
        return res.json(await service[action](req.body));
      } catch (error) {
        if (error instanceof AIServiceError) {
          return res.status(error.statusCode).json({ error: error.code, message: error.message, details: error.details });
        }
        if (error instanceof CatalogUnavailableError) {
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
