"use strict";

// Opt-in integration evaluation: each case spends one live extraction call
// (plus bounded 503 retries). `npm test` imports assertions without running main.
require("dotenv").config({ quiet: true });
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { setTimeout: delay } = require("node:timers/promises");
const { createAIService } = require("../src/aiService");
const { DEFAULT_MODEL } = require("../src/geminiExtractor");
const developmentCases = require("../test/fixtures/ai-parser-cases.json");
const heldoutCases = require("../test/fixtures/ai-parser-heldout-cases.json");
const { SYSTEM_INSTRUCTION, EXTRACTION_SCHEMA } = require("../src/requestExtraction");

function checkExpected(actual, expected, path = "result") {
  if (expected === null || typeof expected !== "object" || Array.isArray(expected)) {
    assert.deepEqual(actual, expected, path);
    return;
  }
  for (const [key, value] of Object.entries(expected)) checkExpected(actual?.[key], value, `${path}.${key}`);
}

function checkResult(result, expected) {
  assert.equal(result.status, expected.status, "status");
  if (expected.draft) checkExpected(result.draft, expected.draft, "draft");
  if (expected.requirements) checkExpected(result.requirements, expected.requirements, "requirements");
  if (expected.itemCounts) {
    const counts = Object.create(null);
    for (const item of result.requirements.items) {
      const canonical = Object.keys(expected.categoryAliases || {}).find((key) => expected.categoryAliases[key].includes(item.category)) || item.category;
      counts[canonical] = !Object.hasOwn(counts, canonical) ? item.quantity : counts[canonical] === null || item.quantity === null ? null : counts[canonical] + item.quantity;
    }
    checkExpected(counts, expected.itemCounts, "itemCounts");
  }
  if (expected.exactCategories) assert.deepEqual([...new Set(result.requirements.items.map((item) => item.category))].sort(), [...expected.exactCategories].sort());
  if (expected.itemUnits) for (const [category, unit] of Object.entries(expected.itemUnits)) assert.ok(result.requirements.items.some((item) => item.category === category && item.unit === unit), `Wrong unit for ${category}`);
  if (expected.itemRequired) for (const [category, required] of Object.entries(expected.itemRequired)) assert.ok(result.requirements.items.some((item) => item.category === category && item.required === required), `Wrong purchase optionality for ${category}`);
  if (expected.itemGroups !== undefined) assert.equal(result.requirements.items.length, expected.itemGroups);
  if (expected.destinationPattern) assert.match(result.requirements.delivery.destination || "", new RegExp(expected.destinationPattern, "i"));
  if (expected.deadlineInstant) assert.equal(Date.parse(result.requirements.delivery.deadlineISO), Date.parse(expected.deadlineInstant));
  if (expected.questionPattern) assert.match(result.questions.map((q) => q.question).join("\n"), new RegExp(expected.questionPattern, "i"));
  const conditions = result.requirements?.items.flatMap((item) => [...item.constraints, ...result.requirements.globalConstraints].map((condition) => ({ ...condition, category: item.category }))) || [];
  for (const required of expected.conditions || []) {
    const found = conditions.some((actual) => {
      if (required.attributePattern && !new RegExp(required.attributePattern, "i").test(actual.attribute)) return false;
      if (required.valuePattern && !new RegExp(required.valuePattern, "i").test(String(actual.value))) return false;
      const fields = Object.fromEntries(Object.entries(required).filter(([key]) => !["attributePattern", "valuePattern"].includes(key)));
      let equivalent = actual;
      // Equality and a singleton allowed-set express exactly the same condition.
      // Preserve strict/inclusive numeric operators; those are not equivalent.
      if (fields.operator === "in" && Array.isArray(fields.value) && fields.value.length === 1 && actual.operator === "eq") equivalent = { ...actual, operator: "in", value: [actual.value] };
      if (fields.operator === "eq" && actual.operator === "in" && Array.isArray(actual.value) && actual.value.length === 1) equivalent = { ...actual, operator: "eq", value: actual.value[0] };
      try { checkExpected(equivalent, fields); return true; } catch { return false; }
    });
    assert.ok(found, `Missing condition ${JSON.stringify(required)}`);
  }
  for (const field of expected.questionFields || []) {
    assert.ok(result.questions.some((entry) => entry.field === field), `Missing question: ${field}`);
  }
  if (expected.noUnsupportedRequirements) assert.deepEqual(result.unsupportedRequirements, [], "unexpected unsupported requirements");
  for (const pattern of expected.unsupportedPatterns || []) {
    assert.match(result.unsupportedRequirements.join("\n"), new RegExp(pattern, "i"), "lost mandatory unsupported condition");
  }
  if (expected.totals) {
    checkExpected(Object.fromEntries(Object.entries(result.plan?.strategies || {}).map(([key, strategy]) => [key, strategy.totalINR])), expected.totals, "totals");
  }
  if (result.status === "NEEDS_CLARIFICATION") {
    assert.equal(result.request, null);
    if (result.contractVersion !== 3) assert.equal(result.plan, null);
  } else {
    assert.deepEqual(result.questions, [], "completed request should not have questions");
  }
  if (result.contractVersion === 3) {
    assert.ok(!["ENGINE_SUPPORT_REQUIRED", "PLANNED", "INFEASIBLE"].includes(result.status), "Parsing must not report optimizer capability or feasibility");
    assert.equal(Object.hasOwn(result, "unsupportedRequirements"), false);
    if (result.status === "READY") { assert.ok(result.request); checkExpected(result.request, result.requirements, "complete request"); }
  }
  if (result.contractVersion !== 3 && ["ENGINE_SUPPORT_REQUIRED", "NOT_PROCUREMENT", "CANCELLED"].includes(result.status)) {
    assert.equal(result.request, null);
    assert.equal(result.plan, null);
    assert.equal(result.canOptimize, false);
  }
  if (result.contractVersion === 3) {
    assert.deepEqual(result.nextQuestion, result.questions[0] || null, "next question must reflect only unresolved information");
    if (["NOT_PROCUREMENT", "CANCELLED"].includes(result.status)) assert.equal(result.request, null);
  }
}

function reusableCase(previous, entry) {
  const cached = previous?.cases?.find((candidate) => candidate.id === entry.id && candidate.passed && candidate.actual);
  if (!cached || JSON.stringify(cached.messages) !== JSON.stringify(entry.messages) || JSON.stringify(cached.expected) !== JSON.stringify(entry.expected)) return null;
  try { checkResult(cached.actual, entry.expected); return cached; } catch { return null; }
}

function validateResume(previous, current, unchangedSinceStart = false) {
  if (previous.scope !== "REQUEST_INTELLIGENCE" || previous.contractVersion !== 3 || previous.model !== current.model || previous.promptHash !== current.promptHash || previous.schemaHash !== current.schemaHash ||
      (previous.parserHash ? previous.parserHash !== current.parserHash : !unchangedSinceStart)) throw new Error("Cannot resume: model, prompt, schema or parser source changed. Run the suite afresh.");
}

async function main() {
  const args = process.argv.slice(2);
  const resumePath = args.find((arg) => arg.startsWith("--resume="))?.slice("--resume=".length);
  const previous = resumePath ? JSON.parse(fs.readFileSync(resumePath, "utf8")) : null;
  const suite = args.find((arg) => arg.startsWith("--suite="))?.split("=")[1] || previous?.suite || "development";
  if (!["development", "heldout", "all"].includes(suite)) throw new Error("Suite must be development, heldout, or all.");
  const ids = args.filter((arg) => !arg.startsWith("--"));
  const cases = suite === "heldout" ? heldoutCases : suite === "all" ? [...developmentCases, ...heldoutCases] : developmentCases;
  const selected = ids.length ? cases.filter((entry) => ids.includes(entry.id)) : cases;
  if (!selected.length || ids.some((id) => !selected.some((entry) => entry.id === id))) throw new Error(`Unknown case selection: ${ids.join(", ")}`);
  const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;
  const startedAt = new Date();
  const contextTime = previous?.contextTime || previous?.startedAt || startedAt.toISOString();
  const reference = new Date(contextTime);
  const api = createAIService({ now: () => reference });
  const referenceDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(reference);
  const tomorrow = new Date(`${referenceDate}T00:00:00Z`); tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const resolveDates = (value) => JSON.parse(JSON.stringify(value).replaceAll("{{tomorrow}}", tomorrow.toISOString().slice(0, 10)));
  const sourceFiles = ["src/requestExtraction.js", "src/requestUnderstanding.js", "src/aiService.js", "src/geminiExtractor.js"].map((file) => path.join(__dirname, "..", file));
  const parserHash = crypto.createHash("sha256").update(sourceFiles.map((file) => fs.readFileSync(file, "utf8")).join("\n")).digest("hex");
  const report = { scope: "REQUEST_INTELLIGENCE", contractVersion: 3, model, suite, startedAt: startedAt.toISOString(), contextTime, referenceDate, parserHash, resumeFrom: resumePath || null, promptHash: crypto.createHash("sha256").update(SYSTEM_INSTRUCTION).digest("hex"), schemaHash: crypto.createHash("sha256").update(JSON.stringify(EXTRACTION_SCHEMA)).digest("hex"), cases: [] };
  if (previous) validateResume(previous, report, sourceFiles.every((file) => fs.statSync(file).mtimeMs <= Date.parse(previous.startedAt)));
  const cache = new Map(selected.map(resolveDates).map((entry) => [entry.id, reusableCase(previous, entry)]).filter(([, value]) => value));
  console.log(`Live model: ${model}. Suite: ${suite}. Cases: ${selected.length}.`);
  if (cache.size) console.log(`Reusing ${cache.size} validated successes with identical source/configuration; remaining cases will call Gemini.`);
  let passed = 0;
  let executed = 0;
  for (const rawEntry of selected) {
    const entry = resolveDates(rawEntry);
    if (cache.has(entry.id)) {
      report.cases.push({ ...cache.get(entry.id), reusedFrom: resumePath });
      passed++;
      continue;
    }
    let result;
    let errorMessage = null;
    let providerFailure = false;
    try {
      executed++;
      result = await api.parse({ requestId: `eval_${entry.id}`, messages: entry.messages });
      checkResult(result, entry.expected);
      passed++;
      console.log(`PASS ${entry.id}: ${result.status}`);
    } catch (error) {
      errorMessage = error.message;
      if (error.code && error.code !== "ERR_ASSERTION") {
        console.error(`${entry.id}: ${error.code}: ${error.message}`);
        providerFailure = true;
      } else {
        console.error(`FAIL ${entry.id}: ${error.message}`);
        console.error(JSON.stringify({ requirements: result?.requirements, draft: result?.draft, questions: result?.questions, unsupportedRequirements: result?.unsupportedRequirements }, null, 2));
      }
    }
    report.cases.push({ id: entry.id, passed: errorMessage === null, error: errorMessage, messages: entry.messages, expected: entry.expected, actual: result ? { ...result, plan: result.plan ? { status: result.plan.status, totals: Object.fromEntries(Object.entries(result.plan.strategies).map(([key, value]) => [key, value.totalINR])) } : null } : null });
    if (providerFailure) break; // preserve the report and avoid spending more calls
    if (report.cases.length < selected.length) await delay(6000); // keep opt-in suites below burst limits
  }
  report.passed = passed;
  report.requested = selected.length;
  report.completed = report.cases.length;
  report.executed = executed;
  report.reused = report.cases.filter((entry) => entry.reusedFrom).length;
  report.finishedAt = new Date().toISOString();
  const directory = path.join(__dirname, "..", "reports", "ai-evaluation");
  fs.mkdirSync(directory, { recursive: true });
  const output = path.join(directory, `${startedAt.toISOString().replace(/[:.]/g, "-")}-parser-${suite}.json`);
  fs.writeFileSync(output, JSON.stringify(report, null, 2) + "\n");
  console.log(`${passed}/${selected.length} live cases passed (${report.completed} completed: ${executed} new model calls, ${report.reused} reused). Report: ${output}. Finite evaluation is not an accuracy guarantee.`);
  if (passed !== selected.length) process.exitCode = 1;
}

if (require.main === module) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}

module.exports = { checkResult, reusableCase, validateResume };
