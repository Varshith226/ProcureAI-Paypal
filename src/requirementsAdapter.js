"use strict";

const { rulesForCategory, validateConstraintValue } = require("./constraintRegistry");
const { validateRequest, DEFAULT_WEIGHTS } = require("./requestValidator");
const { schemaErrors } = require("./requestExtraction");
const { AIServiceError } = require("./aiErrors");

const normalize = (value) => String(value).normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();
const keyName = (value) => normalize(value).replace(/[^a-z0-9]/g, "");

function dateDays(date, referenceDate) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const parsed = new Date(`${date}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) return null;
  return (parsed.getTime() - new Date(`${referenceDate}T00:00:00Z`).getTime()) / 86400000;
}

function convertUnit(value, supplied, expected) {
  if (!supplied || !expected || normalize(supplied) === normalize(expected)) return value;
  const units = {
    months: { month: 1, months: 1, year: 12, years: 12 },
    inches: { inch: 1, inches: 1, in: 1, cm: 1 / 2.54 },
    g: { g: 1, gram: 1, grams: 1, kg: 1000 },
    Hz: { hz: 1, khz: 1000 },
    DPI: { dpi: 1 },
    INR: { inr: 1, rupees: 1, rs: 1 },
  };
  const factor = units[expected]?.[normalize(supplied)];
  return factor === undefined ? null : value * factor;
}

function mapConstraint(category, condition) {
  const rules = Object.entries(rulesForCategory(category)).filter(([, rule]) => keyName(rule.field.split(".").at(-1)) === keyName(condition.attribute));
  const find = (kind) => rules.find(([, rule]) => rule.kind === kind);
  const make = (kind, value) => {
    const entry = find(kind);
    if (!entry) return null;
    const [key, rule] = entry;
    if (typeof value === "number") value = convertUnit(value, condition.unit, rule.unit);
    if (value === null || validateConstraintValue(rule, value)) return null;
    return [key, value];
  };
  const { operator, value } = condition;
  if (operator === "between" && Array.isArray(value) && value.length === 2 && value.every((v) => typeof v === "number")) {
    const min = make("min", value[0]);
    const max = make("max", value[1]);
    return min && max ? [min, max] : null;
  }
  if (operator === "gte" || operator === "lte") {
    const mapped = typeof value === "number" && make(operator === "gte" ? "min" : "max", value);
    return mapped ? [mapped] : null;
  }
  if (operator === "eq" && typeof value === "number") {
    const min = make("min", value);
    const max = make("max", value);
    return min && max ? [min, max] : null; // equality must not silently become a minimum
  }
  if (operator === "eq" && typeof value === "boolean") {
    const mapped = make("equals", value);
    return mapped ? [mapped] : null;
  }
  if (["eq", "in", "not_in"].includes(operator)) {
    const mapped = make(operator === "not_in" ? "notIn" : "in", Array.isArray(value) ? value : [value]);
    return mapped ? [mapped] : null;
  }
  return null;
}

function mergeRule(target, key, value, category) {
  if (!Object.hasOwn(target, key)) { target[key] = value; return; }
  const kind = rulesForCategory(category)[key].kind;
  if (kind === "min") target[key] = Math.max(target[key], value);
  if (kind === "max") target[key] = Math.min(target[key], value);
  if (kind === "in") target[key] = target[key].filter((entry) => value.some((other) => normalize(other) === normalize(entry)));
  if (kind === "notIn") target[key] = [...new Set([...target[key], ...value])];
}

function checkConditions(conditions, messages, field, ask, category = "") {
  const text = normalize(messages.join("\n"));
  const ranges = new Map();
  conditions.forEach((condition, i) => {
    const path = `${field}[${i}]`;
    if (!text.includes(normalize(condition.sourceText))) ask(path, `Please confirm the requirement '${condition.sourceText}'; it was not found in your messages.`);
    let value = condition.value;
    if (["gte", "lte"].includes(condition.operator) && typeof value !== "number") ask(path, `What numeric limit do you mean by '${condition.sourceText}'?`);
    if (["in", "not_in"].includes(condition.operator) && (!Array.isArray(value) || !value.length)) ask(path, `Which values are allowed or excluded by '${condition.sourceText}'?`);
    if (condition.operator === "between" && (!Array.isArray(value) || value.length !== 2 || !value.every((v) => typeof v === "number") || value[0] > value[1])) ask(path, `Please give an ordered numeric range for '${condition.sourceText}'.`);
    if (condition.importance !== "HARD") return;
    const rule = Object.values(rulesForCategory(category)).find((entry) => keyName(entry.field.split(".").at(-1)) === keyName(condition.attribute));
    let comparableUnit = condition.unit;
    if (rule?.unit && typeof value === "number") {
      const converted = convertUnit(value, condition.unit, rule.unit);
      if (converted !== null) { value = converted; comparableUnit = rule.unit; }
    }
    const group = `${keyName(condition.attribute)}:${normalize(comparableUnit || "")}`;
    const range = ranges.get(group) || { min: -Infinity, max: Infinity, equals: [], allowed: null, excluded: [] };
    if (condition.operator === "gte" && typeof value === "number") range.min = Math.max(range.min, value);
    if (condition.operator === "lte" && typeof value === "number") range.max = Math.min(range.max, value);
    if (condition.operator === "between" && Array.isArray(value)) { range.min = Math.max(range.min, value[0]); range.max = Math.min(range.max, value[1]); }
    if (condition.operator === "eq") {
      range.equals.push(JSON.stringify(typeof value === "string" ? normalize(value) : value));
      if (typeof value === "number") { range.min = Math.max(range.min, value); range.max = Math.min(range.max, value); }
    }
    if (condition.operator === "in" && Array.isArray(value)) {
      const options = value.map(normalize);
      range.allowed = range.allowed === null ? options : range.allowed.filter((entry) => options.includes(entry));
    }
    if (condition.operator === "not_in" && Array.isArray(value)) range.excluded.push(...value.map(normalize));
    const excludedEquality = range.equals.some((entry) => range.excluded.includes(normalize(JSON.parse(entry))));
    if (range.min > range.max || new Set(range.equals).size > 1 || excludedEquality || (range.allowed !== null && !range.allowed.some((entry) => !range.excluded.includes(entry)))) ask(path, `The hard requirements for ${condition.attribute} conflict. Which should apply?`);
    ranges.set(group, range);
  });
}

function checkMappedConditions(mapped, category, field, ask) {
  const grouped = new Map();
  for (const [key, value] of Object.entries(mapped)) {
    const rule = rulesForCategory(category)[key];
    const values = grouped.get(rule.field) || {};
    values[rule.kind] = value;
    grouped.set(rule.field, values);
  }
  for (const [attribute, values] of grouped) {
    if ((values.min !== undefined && values.max !== undefined && values.min > values.max) ||
        (values.in && !values.in.some((value) => !(values.notIn || []).some((excluded) => normalize(value) === normalize(excluded))))) {
      ask(field, `The requirements for ${attribute} conflict after unit conversion. Which should apply?`);
    }
  }
}

function compileRequirements(requirements, { requestId, messages, referenceDate }) {
  if (schemaErrors(requirements).length) throw new AIServiceError("AI_INVALID_OUTPUT", "AI output did not match the requirement schema. Try again.");
  const data = structuredClone(requirements);
  const questions = [];
  const assumptions = [...data.assumptions];
  const issues = [];
  const ask = (field, question) => { if (!questions.some((entry) => entry.field === field)) questions.push({ field, question }); };
  const base = { contractVersion: 2, requestId, status: "READY", understandingStatus: "READY", requirements: data, request: null, draft: null, questions, unsupportedRequirements: issues, assumptions, canOptimize: false, plan: null, recommendation: null, referenceDate };
  if (data.intent !== "PROCUREMENT") return { ...base, status: data.intent === "CANCEL" ? "CANCELLED" : "NOT_PROCUREMENT" };
  data.ambiguities.forEach((question, i) => ask(`ambiguities[${i}]`, question));
  const { budget, delivery } = data;
  if (!budget.unlimited && budget.amount === null) ask("budgetINR", "What is your total purchasing budget?");
  if (budget.amount !== null && (budget.amount <= 0 || !Number.isSafeInteger(Math.round(budget.amount * 100)) || Math.abs(budget.amount * 100 - Math.round(budget.amount * 100)) > 0.001)) ask("budgetINR", "Please give a positive, safely representable budget with at most two decimal places.");
  if (budget.minAmount !== null && (budget.minAmount < 0 || (budget.amount !== null && budget.minAmount > budget.amount))) ask("budget.minAmount", "Please clarify the minimum and maximum budget.");
  if (!budget.unlimited && budget.currency === null) ask("budget.currency", "Which currency is your budget in?");
  if (!budget.unlimited && budget.amount !== null && budget.scope === "UNKNOWN") ask("budget.scope", "Is that the total basket budget or a per-item budget?");
  if (budget.unlimited && budget.amount !== null) ask("budget", "Should the stated budget cap apply, or is the budget unlimited?");
  if (budget.unlimited) issues.push("The v1 optimizer requires a finite total budget; unlimited budget is preserved in requirements.");
  if (budget.currency !== null && budget.currency.toUpperCase() !== "INR") issues.push(`Budget currency ${budget.currency} is parsed; the current optimizer only prices baskets in INR. No FX conversion was made.`);
  if (budget.scope === "PER_ITEM") issues.push("Per-item budget is preserved; the v1 optimizer also needs a total basket budget including shipping.");
  if (budget.minAmount !== null) issues.push("A minimum spending requirement is preserved; v1 only enforces a maximum total budget.");
  if (budget.includesShipping === false || budget.includesTax === false) issues.push("Budget exclusions for shipping/tax need an engine that models the extra charges separately.");
  if (budget.includesTax === true) issues.push("An explicit tax-inclusive guarantee needs tax data; v1 does not model taxes separately.");

  let days = delivery.maxDays;
  if (days !== null && (!Number.isInteger(days) || days < 0)) ask("maxDeliveryDays", "Delivery duration must be a non-negative whole number of days.");
  if (delivery.deadlineISO !== null) {
    const dateLimit = dateDays(delivery.deadlineISO, referenceDate);
    if (dateLimit === null || dateLimit < 0) ask("delivery.deadlineISO", "Please give a valid delivery date on or after the reference date.");
    else days = days === null ? dateLimit : Math.min(days, dateLimit);
  }
  if (delivery.unrestricted && (delivery.maxDays !== null || delivery.deadlineISO !== null)) ask("delivery", "Should the delivery deadline apply, or is there no deadline?");
  if (delivery.unrestricted) { days = 365; assumptions.push("No delivery deadline requested; the v1 optimizer uses its 365-day horizon."); }
  else if (days === null) ask("maxDeliveryDays", "Within how many days, or by which date, do you need delivery?");
  if (days > 365) issues.push("The parsed delivery horizon exceeds v1's 365-day limit.");
  if (delivery.destination !== null) issues.push(`Destination '${delivery.destination}' is preserved; v1 cannot verify destination-specific delivery.`);

  if (!data.items.length) ask("requiredCategories", "Which items do you want to buy, and how many of each?");
  const categories = new Map();
  const hardConstraints = {};
  checkConditions(data.globalConstraints, messages, "globalConstraints", ask);
  data.items.forEach((item, index) => {
    const field = `requiredCategories[${index}]`;
    item.category = normalize(item.category).replace(/ /g, "_");
    if (!/^[a-z0-9][a-z0-9_]*$/.test(item.category) || ["constructor", "prototype"].includes(item.category)) { ask(`${field}.category`, "Please give a valid product category name."); return; }
    item.unit = normalize(item.unit);
    const quantityRange = item.constraints.find((condition) => keyName(condition.attribute) === "quantity" && condition.importance === "HARD" && condition.operator === "between" && Array.isArray(condition.value) && condition.value.length === 2 && condition.value.every((value) => typeof value === "number" && value > 0) && condition.value[0] <= condition.value[1]);
    if (item.quantity === null && !quantityRange) ask(`${field}.quantity`, `How many ${item.category} (${item.unit}) do you need?`);
    else if (item.quantity !== null && (item.quantity <= 0 || item.quantity > Number.MAX_SAFE_INTEGER)) ask(`${field}.quantity`, "Please give a positive, safely representable quantity.");
    else if (item.quantity !== null && ["unit", "piece", "pair"].includes(item.unit) && !Number.isInteger(item.quantity)) ask(`${field}.quantity`, "Countable items need a whole-number quantity.");
    if (!["unit", "piece", "pair"].includes(item.unit)) issues.push(`${item.category}: unit '${item.unit}' is parsed; v1 requires catalog order-line units.`);
    if (!item.required) issues.push(`${item.category}: optional purchase is preserved; v1 only optimizes mandatory fixed-category baskets.`);
    if (item.quantity > 100) issues.push(`${item.category}: quantity ${item.quantity} exceeds v1's per-category limit of 100.`);
    checkConditions([...data.globalConstraints, ...item.constraints], messages, `items[${index}].constraints`, ask, item.category);
    const mapped = {};
    for (const condition of [...data.globalConstraints, ...item.constraints]) {
      if (condition.importance === "SOFT") { assumptions.push(`Optional preference retained, not independently scored: ${item.category}: ${condition.sourceText}`); continue; }
      if (typeof condition.value === "number" && condition.value < 0 && Object.values(rulesForCategory(item.category)).some((rule) => ["min", "max"].includes(rule.kind) && keyName(rule.field.split(".").at(-1)) === keyName(condition.attribute))) ask(`items[${index}].constraints`, `Please give a non-negative ${condition.attribute} requirement.`);
      const entries = mapConstraint(item.category, condition);
      if (!entries) issues.push(`${item.category}: cannot enforce ${condition.attribute} ${condition.operator} ${JSON.stringify(condition.value)}${condition.unit ? ` ${condition.unit}` : ""} (${condition.sourceText}).`);
      else for (const [key, value] of entries) mergeRule(mapped, key, value, item.category);
    }
    checkMappedConditions(mapped, item.category, `items[${index}].constraints`, ask);
    const signature = JSON.stringify(Object.entries(mapped).sort(([a], [b]) => a.localeCompare(b)));
    if (categories.has(item.category)) {
      const prior = categories.get(item.category);
      if (prior.signature !== signature || prior.unit !== item.unit) issues.push(`${item.category}: different item variants need separate engine line requirements; they were retained in requirements.items.`);
      prior.quantity = prior.quantity === null || item.quantity === null ? null : prior.quantity + item.quantity;
    } else {
      categories.set(item.category, { quantity: item.quantity, signature, unit: item.unit });
      if (Object.keys(mapped).length) hardConstraints[item.category] = mapped;
    }
  });
  if (categories.size > 20) issues.push("The request has more than the v1 limit of 20 categories.");
  for (const [category, entry] of categories) if (entry.quantity > 100) issues.push(`${category}: combined quantity exceeds v1's limit of 100.`);
  const weights = data.weights ?? { ...DEFAULT_WEIGHTS };
  const weightValidation = validateRequest({ requestId, budgetINR: 1, maxDeliveryDays: 1, requiredCategories: [{ category: "test", quantity: 1 }], weights });
  if (!weightValidation.ok) for (const error of weightValidation.errors) ask(error.field, `Please clarify ${error.field}: ${error.message}.`);
  if (data.weights === null) assumptions.push("Default scoring weights: quality 0.45, reliability 0.35, delivery 0.20. Price is a budget cap and tie-breaker; CHEAPEST minimizes cost separately.");
  const draft = { budgetINR: budget.currency?.toUpperCase() === "INR" ? budget.amount : null, maxDeliveryDays: days, requiredCategories: [...categories].map(([category, entry]) => ({ category, quantity: entry.quantity })), hardConstraints, weights, ambiguities: data.ambiguities, unsupportedRequirements: [...new Set(issues)], assumptions: [...new Set(assumptions)] };
  const candidate = { requestId, rawQuery: messages.join("\nFollow-up: "), budgetINR: draft.budgetINR, maxDeliveryDays: days, requiredCategories: draft.requiredCategories, hardConstraints, weights };
  if (!questions.length && !issues.length) {
    const validation = validateRequest(candidate);
    if (!validation.ok) for (const error of validation.errors) issues.push(`${error.field}: ${error.message}`);
  }
  const status = questions.length ? "NEEDS_CLARIFICATION" : issues.length ? "ENGINE_SUPPORT_REQUIRED" : "READY";
  return { ...base, requirements: data, status, understandingStatus: questions.length ? "NEEDS_CLARIFICATION" : "READY", draft, request: status === "READY" ? candidate : null, canOptimize: status === "READY", unsupportedRequirements: [...new Set(issues)], assumptions: [...new Set(assumptions)] };
}

module.exports = { compileRequirements, mapConstraint, dateDays };
