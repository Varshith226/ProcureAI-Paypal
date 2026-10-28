"use strict";

const { randomUUID } = require("node:crypto");
const { AIServiceError } = require("./aiErrors");
const { createGeminiExtractor } = require("./geminiExtractor");
const { schemaErrors, SUPPORTED_CATEGORIES } = require("./requestExtraction");
const { validateRequest, DEFAULT_WEIGHTS } = require("./requestValidator");
const { buildPlanDetailed } = require("./planService");
const { defaultCatalogProvider } = require("./checkoutGuard");
const { planStore: defaultPlanStore } = require("./planStore");

function validateConversation(body) {
  const details = [];
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new AIServiceError("INVALID_AI_REQUEST", "Send a JSON object with messages: string[].", 400);
  }
  const extra = Object.keys(body).filter((key) => !["messages", "requestId"].includes(key));
  if (extra.length) details.push({ field: "(body)", message: `Unsupported fields: ${extra.join(", ")}. Send user messages, not a client-generated draft.` });
  if (!Array.isArray(body.messages) || body.messages.length < 1 || body.messages.length > 20 ||
      body.messages.some((message) => typeof message !== "string" || !message.trim() || message.length > 8000)) {
    details.push({ field: "messages", message: "Send 1..20 non-empty user messages, each at most 8000 characters." });
  } else if (body.messages.join("\n").length > 16000) {
    details.push({ field: "messages", message: "Conversation must be at most 16000 characters in total." });
  }
  if (body.requestId !== undefined && (typeof body.requestId !== "string" || !body.requestId.trim() || body.requestId.length > 128)) {
    details.push({ field: "requestId", message: "Must be a non-empty string of at most 128 characters." });
  }
  if (details.length) throw new AIServiceError("INVALID_AI_REQUEST", "The request-intelligence input is invalid.", 400, details);
  return { requestId: body.requestId?.trim() || `req_${randomUUID()}`, messages: body.messages.map((message) => message.trim()) };
}

function buildBrief(draft, { requestId, messages }) {
  const errors = schemaErrors(draft);
  if (errors.length) throw new AIServiceError("AI_INVALID_OUTPUT", "AI output did not match the requirement schema. Try again.");

  const assumptions = [...draft.assumptions];
  const questions = [];
  const unsupportedRequirements = [...draft.unsupportedRequirements];
  const ask = (field, question) => {
    if (!questions.some((entry) => entry.field === field)) questions.push({ field, question });
  };
  if (draft.budgetINR === null) ask("budgetINR", "What is your total budget in INR, including shipping?");
  if (draft.maxDeliveryDays === null) ask("maxDeliveryDays", "Within how many days do you need all items delivered?");
  if (!draft.requiredCategories.length) ask("requiredCategories", "Which items do you want to buy, and how many of each?");
  for (const [i, entry] of draft.requiredCategories.entries()) {
    if (entry.quantity === null) ask(`requiredCategories[${i}].quantity`, `How many ${entry.category} units do you need?`);
    if (!SUPPORTED_CATEGORIES.includes(entry.category.trim().toLowerCase())) {
      unsupportedRequirements.push(`Category '${entry.category}' is not supported. Available categories: ${SUPPORTED_CATEGORIES.join(", ")}.`);
    }
  }
  draft.ambiguities.forEach((question, i) => ask(`ambiguities[${i}]`, question));
  if (unsupportedRequirements.length) {
    ask("unsupportedRequirements", "Some requirements cannot be checked by the current engine. Would you like to revise them, or wait for catalog/verifier support? See unsupportedRequirements.");
  }
  if (draft.weights === null) assumptions.push("Default scoring weights: quality 0.45, reliability 0.35, delivery 0.20. Price is a budget cap and tie-breaker; CHEAPEST minimizes cost separately.");
  const candidate = {
    requestId, rawQuery: messages.join("\nFollow-up: "),
    budgetINR: draft.budgetINR, maxDeliveryDays: draft.maxDeliveryDays,
    requiredCategories: draft.requiredCategories, hardConstraints: draft.hardConstraints,
    weights: draft.weights ?? { ...DEFAULT_WEIGHTS },
  };
  const validation = validateRequest(candidate);
  if (!validation.ok) {
    for (const problem of validation.errors) ask(problem.field, `Please clarify ${problem.field}: ${problem.message}.`);
  }
  const ready = questions.length === 0;
  const request = ready ? {
    ...candidate,
    requiredCategories: validation.value.requiredCategories,
    hardConstraints: validation.value.hardConstraints,
    weights: validation.value.weights,
  } : null;
  return {
    requestId, status: ready ? "READY" : "NEEDS_CLARIFICATION",
    request, draft, questions,
    unsupportedRequirements: [...new Set(unsupportedRequirements)],
    assumptions: [...new Set(assumptions)], plan: null, recommendation: null,
  };
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
  extract = createGeminiExtractor(), catalogProvider = defaultCatalogProvider,
  planStore = defaultPlanStore,
} = {}) {
  async function parse(body) {
    const conversation = validateConversation(body);
    return buildBrief(await extract(conversation.messages), conversation);
  }
  return {
    parse,
    async plan(body) {
      const brief = await parse(body);
      if (brief.status !== "READY") return brief;
      const { plan, request } = await buildPlanDetailed(brief.request, catalogProvider);
      planStore.save(plan, request);
      return {
        ...brief, status: plan.status === "INFEASIBLE" ? "INFEASIBLE" : "PLANNED",
        plan, recommendation: summarizePlan(plan),
      };
    },
  };
}

module.exports = { createAIService, validateConversation, buildBrief };
