"use strict";

const { randomUUID } = require("node:crypto");
const { AIServiceError } = require("./aiErrors");
const { createGeminiExtractor } = require("./geminiExtractor");
const { understandRequest } = require("./requestUnderstanding");

function validateConversation(body) {
  const details = [];
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new AIServiceError("INVALID_AI_REQUEST", "Send a JSON object with messages: string[].", 400);
  }
  const extra = Object.keys(body).filter((key) => !["messages", "requestId"].includes(key));
  if (extra.length) details.push({ field: "(body)", message: `Unsupported fields: ${extra.join(", ")}. Send user messages, not a client-generated draft.` });
  if (!Array.isArray(body.messages) || body.messages.length < 1 || body.messages.length > 100 ||
      body.messages.some((message) => typeof message !== "string" || !message.trim() || message.length > 8000)) {
    details.push({ field: "messages", message: "Send 1..100 non-empty user messages, each at most 8000 characters." });
  } else if (body.messages.join("\n").length > 16000) {
    details.push({ field: "messages", message: "Conversation must be at most 16000 characters in total." });
  }
  if (body.requestId !== undefined && (typeof body.requestId !== "string" || !body.requestId.trim() || body.requestId.length > 128)) {
    details.push({ field: "requestId", message: "Must be a non-empty string of at most 128 characters." });
  }
  if (details.length) throw new AIServiceError("INVALID_AI_REQUEST", "The request-intelligence input is invalid.", 400, details);
  return { requestId: body.requestId?.trim() || `req_${randomUUID()}`, messages: body.messages.map((message) => message.trim()) };
}

function referenceDateInIndia(date = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date).map(({ type, value }) => [type, value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function buildBrief(requirements, context) {
  return require("./requirementsAdapter").compileRequirements(requirements, { referenceDate: referenceDateInIndia(), ...context });
}

function summarizePlan(plan) {
  const key = plan.strategies.BEST_VALUE ? "BEST_VALUE" : Object.keys(plan.strategies)[0];
  const selected = plan.strategies[key];
  if (!selected) return null;
  return {
    strategyKey: key, totalINR: selected.totalINR,
    leftoverBudgetINR: selected.leftoverBudgetINR,
    verificationLevel: selected.verificationLevel,
    summary: `${selected.strategyName}: INR ${selected.totalINR}, with INR ${selected.leftoverBudgetINR} remaining. ${selected.objectiveSummary}`,
    requiresUserApproval: true,
  };
}

function createAIService({
  extract = createGeminiExtractor(), catalogProvider,
  planStore,
  now = () => new Date(),
} = {}) {
  async function parse(body) {
    const conversation = validateConversation(body);
    const current = now();
    const referenceDate = referenceDateInIndia(current);
    const referenceTime = current.toISOString();
    return understandRequest(await extract(conversation.messages, { referenceDate, referenceTime, timezone: "Asia/Kolkata" }), { ...conversation, referenceDate, referenceTime });
  }
  return {
    parse,
    async plan(body) {
      // Legacy integration only. Parsing never loads or calls optimizer code.
      const parsed = await parse(body);
      if (parsed.status !== "READY") return { ...parsed, plan: null, recommendation: null };
      const brief = buildBrief(parsed.requirements, { requestId: parsed.requestId, messages: validateConversation(body).messages, referenceDate: parsed.referenceDate });
      if (brief.status !== "READY") return brief;
      const { buildPlanDetailed } = require("./planService");
      const provider = catalogProvider || require("./checkoutGuard").defaultCatalogProvider;
      const store = planStore || require("./planStore").planStore;
      const { plan, request } = await buildPlanDetailed(brief.request, provider);
      store.save(plan, request);
      return {
        ...brief, status: plan.status === "INFEASIBLE" ? "INFEASIBLE" : "PLANNED",
        plan, recommendation: summarizePlan(plan),
      };
    },
  };
}

module.exports = { createAIService, validateConversation, buildBrief };
