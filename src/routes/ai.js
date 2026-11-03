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

  const { negotiateVendorDiscount } = require("../negotiationService");
  const { runProcurementAgent, parseAndCompareQuote } = require("../agentService");

  // Autonomous 2-Agent Negotiation: Buyer Agent vs Merchant Quote Engine
  router.post("/negotiate", async (req, res) => {
    try {
      const { planId, items, currentTotalINR, targetDiscountINR, maxRounds } = req.body;
      if (!currentTotalINR) {
        return res.status(400).json({ error: "currentTotalINR is required" });
      }
      const result = await negotiateVendorDiscount({
        planId,
        items,
        currentTotalINR,
        targetDiscountINR,
        maxRounds,
      });
      res.json(result);
    } catch (err) {
      console.error("[ai-negotiate] error:", err);
      res.status(500).json({ error: "NEGOTIATION_FAILED", message: err.message });
    }
  });

  // Tool-Calling Autonomous Procurement Agent Loop
  router.post("/agent/run", async (req, res) => {
    try {
      const { prompt, budgetINR, maxDeliveryDays, minRefreshRateHz } = req.body;
      const trace = await runProcurementAgent({
        prompt,
        budgetINR,
        maxDeliveryDays,
        minRefreshRateHz,
      });
      res.json(trace);
    } catch (err) {
      console.error("[ai-agent] error:", err);
      res.status(500).json({ error: "AGENT_EXECUTION_FAILED", message: err.message });
    }
  });

  // Multimodal Quote Intake & Competitive Advantage Analysis
  router.post("/compare-quote", async (req, res) => {
    try {
      const { rawText, budgetINR } = req.body;
      const analysis = await parseAndCompareQuote({ rawText, budgetINR });
      res.json(analysis);
    } catch (err) {
      console.error("[ai-compare-quote] error:", err);
      res.status(500).json({ error: "QUOTE_COMPARISON_FAILED", message: err.message });
    }
  });

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
