"use strict";

const { schemaErrors } = require("./requestExtraction");
const { AIServiceError } = require("./aiErrors");

const normalize = (value) => String(value).normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();
const comparable = (value) => JSON.stringify(typeof value === "string" ? normalize(value) : value);

// Physical units are used only to detect contradictory statements. They do not
// restrict which products, quantities, currencies or attributes may be parsed.
const UNITS = {
  year: ["month", 12], years: ["month", 12], month: ["month", 1], months: ["month", 1],
  kg: ["g", 1000], g: ["g", 1], grams: ["g", 1], gram: ["g", 1],
  m: ["cm", 100], cm: ["cm", 1], mm: ["cm", .1], inch: ["cm", 2.54], inches: ["cm", 2.54], in: ["cm", 2.54],
  litre: ["ml", 1000], litres: ["ml", 1000], liter: ["ml", 1000], liters: ["ml", 1000], l: ["ml", 1000], ml: ["ml", 1],
  hz: ["Hz", 1], khz: ["Hz", 1000], gb: ["GB", 1], tb: ["GB", 1000],
};

function calendarDay(iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const date = new Date(`${iso}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === iso ? date.getTime() / 86400000 : null;
}

function checkConditions(conditions, messages, path, ask) {
  const source = normalize(messages.join("\n"));
  const groups = new Map();
  for (const [index, condition] of conditions.entries()) {
    const field = `${path}[${index}]`;
    let value = condition.value;
    if (!source.includes(normalize(condition.sourceText))) ask(field, `Please confirm what you mean by '${condition.sourceText}'.`);
    const vagueNumeric = /\b(high|low|fast|slow|large|small|big|lightweight|heavy|powerful)\b/i.test(condition.sourceText) && !/\d|\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|half|quarter|hundred|thousand)\b/i.test(condition.sourceText) && (typeof value === "number" || (Array.isArray(value) && value.every((v) => typeof v === "number")));
    if (vagueNumeric) {
      // Do not turn qualitative language into an invented numeric specification.
      value = condition.value = condition.sourceText;
      condition.operator = "contains";
      if (condition.importance === "HARD") ask(field, `What numeric limit do you mean by '${condition.sourceText}'?`);
    }
    if (["gt", "gte", "lt", "lte"].includes(condition.operator) && typeof value !== "number") ask(field, `What numeric limit should '${condition.sourceText}' meet?`);
    if (["in", "not_in"].includes(condition.operator) && (!Array.isArray(value) || !value.length)) ask(field, `Which values do you want allowed or excluded?`);
    if (condition.operator === "between" && (!Array.isArray(value) || value.length !== 2 || !value.every((v) => typeof v === "number") || value[0] > value[1])) ask(field, `What are the minimum and maximum values for ${condition.attribute}?`);
    if (condition.importance !== "HARD") continue;
    const unit = UNITS[normalize(condition.unit || "")];
    if (unit && typeof value === "number") value *= unit[1];
    if (unit && Array.isArray(value) && value.every((v) => typeof v === "number")) value = value.map((v) => v * unit[1]);
    const key = `${normalize(condition.attribute)}:${unit?.[0] || normalize(condition.unit || "")}`;
    const group = groups.get(key) || { low: -Infinity, high: Infinity, lowOpen: false, highOpen: false, equal: [], allowed: null, excluded: [] };
    const lower = (v, open = false) => { if (v > group.low) { group.low = v; group.lowOpen = open; } else if (v === group.low) group.lowOpen ||= open; };
    const upper = (v, open = false) => { if (v < group.high) { group.high = v; group.highOpen = open; } else if (v === group.high) group.highOpen ||= open; };
    if (["gte", "gt"].includes(condition.operator) && typeof value === "number") lower(value, condition.operator === "gt");
    if (["lte", "lt"].includes(condition.operator) && typeof value === "number") upper(value, condition.operator === "lt");
    if (condition.operator === "between" && Array.isArray(value) && value.every((v) => typeof v === "number")) { lower(value[0]); upper(value[1]); }
    if (condition.operator === "eq") {
      group.equal.push(comparable(value));
      if (typeof value === "number") { lower(value); upper(value); }
    }
    if (condition.operator === "in" && Array.isArray(value)) {
      const choices = value.map(comparable);
      group.allowed = group.allowed === null ? choices : group.allowed.filter((v) => choices.includes(v));
    }
    if (condition.operator === "not_in" && Array.isArray(value)) group.excluded.push(...value.map(comparable));
    const impossibleChoices = group.allowed !== null && !group.allowed.some((v) => !group.excluded.includes(v));
    const impossibleEquality = group.equal.some((v) => group.excluded.includes(v) || (group.allowed !== null && !group.allowed.includes(v)));
    if (group.low > group.high || (group.low === group.high && (group.lowOpen || group.highOpen)) || new Set(group.equal).size > 1 || impossibleChoices || impossibleEquality) ask(field, `Your requirements for ${condition.attribute} conflict. Which should apply?`);
    groups.set(key, group);
  }
}

function validDeadline(iso, referenceDate, referenceTime) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return calendarDay(iso) !== null && calendarDay(iso) >= calendarDay(referenceDate);
  if (!/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:[0-5]\d)$/.test(iso) || calendarDay(iso.slice(0, 10)) === null) return false;
  const time = Date.parse(iso);
  return Number.isFinite(time) && time >= Date.parse(referenceTime || `${referenceDate}T00:00:00Z`);
}

function understandRequest(requirements, { requestId, messages, referenceDate, referenceTime }) {
  if (schemaErrors(requirements).length) throw new AIServiceError("AI_INVALID_OUTPUT", "AI output did not match the request schema. Please try again.");
  const data = structuredClone(requirements);
  const questions = [];
  const ask = (field, question) => { if (!questions.some((q) => q.field === field)) questions.push({ field, question }); };
  const base = { contractVersion: 3, requestId, status: "READY", request: null, requirements: data, questions, nextQuestion: null, assumptions: [...data.assumptions], referenceDate };
  if (data.intent !== "PROCUREMENT") {
    data.items = []; data.globalConstraints = [];
    return { ...base, status: data.intent === "CANCEL" ? "CANCELLED" : "NOT_PROCUREMENT", message: data.intent === "CANCEL" ? "Your purchasing brief has been cancelled. No order or payment action was taken." : "Tell me what you would like to buy, and I can help clarify the requirements." };
  }
  data.ambiguities.forEach((question, index) => ask(`ambiguities[${index}]`, question));
  const { budget, delivery } = data;
  if (!budget.unlimited && budget.amount === null) ask("budget.amount", "What is your budget and currency, or should there be no spending cap?");
  if (budget.amount !== null && (budget.amount <= 0 || budget.amount > Number.MAX_SAFE_INTEGER)) ask("budget.amount", "What positive, safely representable budget amount should I use?");
  if (!budget.unlimited && budget.amount !== null && budget.currency === null) ask("budget.currency", "Which currency is that budget in?");
  if (!budget.unlimited && budget.amount !== null && budget.scope === "UNKNOWN") ask("budget.scope", "Is that budget for the whole purchase or for each item?");
  if (budget.minAmount !== null && (budget.minAmount < 0 || (budget.amount !== null && budget.minAmount > budget.amount))) ask("budget.minAmount", "What minimum and maximum budget should apply?");
  if (budget.unlimited && budget.amount !== null) ask("budget.unlimited", "Should the stated spending cap apply, or is there no budget limit?");
  if (!delivery.unrestricted && delivery.maxDays === null && delivery.deadlineISO === null) ask("delivery", "When do you need delivery, or is the timing flexible?");
  if (delivery.maxDays !== null && delivery.maxDays < 0) ask("delivery.maxDays", "How much time is available for delivery? Same-day delivery is zero days.");
  if (delivery.deadlineISO !== null && !validDeadline(delivery.deadlineISO, referenceDate, referenceTime)) ask("delivery.deadlineISO", "What valid future delivery date or time should I use?");
  if (delivery.unrestricted && (delivery.maxDays !== null || delivery.deadlineISO !== null)) ask("delivery", "Should the stated delivery deadline apply, or is the timing flexible?");
  if (!data.items.length) ask("items", "Which items do you want to buy, and how many of each?");
  checkConditions(data.globalConstraints, messages, "globalConstraints", ask);
  data.items.forEach((item, index) => {
    const path = `items[${index}]`;
    item.category = normalize(item.category).replace(/ /g, "_");
    if (!/^[a-z0-9][a-z0-9_]*$/.test(item.category) || ["constructor", "prototype"].includes(item.category)) ask(`${path}.category`, "What product category do you mean?");
    if (item.unit !== null) item.unit = normalize(item.unit);
    const ranged = item.constraints.some((c) => normalize(c.attribute) === "quantity" && c.operator === "between" && Array.isArray(c.value) && c.value.length === 2 && c.value.every((v) => typeof v === "number" && v > 0) && c.value[0] <= c.value[1]);
    if (item.quantity === null && !ranged) ask(`${path}.quantity`, `How many ${item.category} do you need${item.unit ? ` (in ${item.unit})` : ", and in which unit"}?`);
    if (item.quantity !== null && (item.quantity <= 0 || item.quantity > Number.MAX_SAFE_INTEGER)) ask(`${path}.quantity`, `What positive quantity of ${item.category} do you need?`);
    if (item.quantity !== null && ["unit", "piece", "pair"].includes(item.unit) && !Number.isInteger(item.quantity)) ask(`${path}.quantity`, `How many whole ${item.category} items or pairs do you need?`);
    if (item.quantity !== null && item.unit === null) ask(`${path}.unit`, `Which unit do you mean for ${item.quantity} ${item.category}, for example kilograms, litres, or packs?`);
    // Common purchase-critical details are clarification safeguards, not catalog
    // allowlists. Every other category still uses the same generic schema.
    const conditions = [...data.globalConstraints, ...item.constraints];
    const fitted = /(?:^|_)(?:shirt|tshirt|t_shirt|jacket|trouser|trousers|pants|jeans|dress|shoe|shoes|footwear)$/.test(item.category);
    if (fitted && !conditions.some((c) => /size|measurements|fit/i.test(c.attribute)) && !questions.some((q) => /\bsize\b/i.test(q.question))) ask(`${path}.size`, `What size do you need for ${item.category.replace(/_/g, " ")}, or should sizes be assorted/flexible?`);
    if (/(?:^|_)(?:printer_)?cartridge$/.test(item.category) && !conditions.some((c) => /model|compatib|partNumber|sku|productName/i.test(c.attribute)) && !questions.some((q) => /model|compatible|cartridge/i.test(q.question))) ask(`${path}.model`, "Which printer model or cartridge model must these replacements fit?");
    if (["software", "software_subscription", "subscription"].includes(item.category) && !conditions.some((c) => /purpose|function|softwareType|productName|model|useCase|category|name/i.test(c.attribute)) && !questions.some((q) => /purpose|software|type/i.test(q.question))) ask(`${path}.purpose`, "What type of software or purpose is this subscription for? A product name is also fine.");
    checkConditions([...data.globalConstraints, ...item.constraints], messages, `${path}.constraints`, ask);
  });
  if (data.weights !== null) {
    const values = Object.values(data.weights);
    if (values.some((v) => v < 0 || v > 1) || Math.abs(values.reduce((sum, v) => sum + v, 0) - 1) > .001) ask("weights", "Which preference weights should apply? Use values from zero to one that sum to one.");
  }
  const ready = questions.length === 0;
  return { ...base, status: ready ? "READY" : "NEEDS_CLARIFICATION", nextQuestion: questions[0] || null, request: ready ? { requestId, rawQuery: messages.join("\nFollow-up: "), ...data } : null };
}

function clarificationTurn(question, answer) {
  if (!question || typeof question.field !== "string" || typeof question.question !== "string" || typeof answer !== "string" || !answer.trim()) throw new Error("A clarification question and non-empty answer are required.");
  return `Answer to clarification (${question.field}): ${question.question}\nMy answer: ${answer.trim()}`;
}

module.exports = { understandRequest, clarificationTurn };
