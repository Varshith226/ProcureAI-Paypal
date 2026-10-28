"use strict";

// Opt-in integration evaluation: each case spends one live extraction call
// (plus bounded 503 retries). `npm test` imports assertions without running main.
require("dotenv").config({ quiet: true });
const assert = require("node:assert/strict");
const { createAIService } = require("../src/aiService");
const { DEFAULT_MODEL } = require("../src/geminiExtractor");
const cases = require("../test/fixtures/ai-live-cases.json");

function checkExpected(actual, expected, path = "result") {
  if (expected === null || typeof expected !== "object" || Array.isArray(expected)) {
    assert.deepEqual(actual, expected, path);
    return;
  }
  for (const [key, value] of Object.entries(expected)) checkExpected(actual?.[key], value, `${path}.${key}`);
}

function checkResult(result, expected) {
  assert.equal(result.status, expected.status, "status");
  checkExpected(result.draft, expected.draft, "draft");
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
    assert.equal(result.plan, null);
  } else {
    assert.deepEqual(result.questions, [], "completed request should not have questions");
  }
}

async function main() {
  const caseId = process.argv[2];
  const selected = caseId ? cases.filter((entry) => entry.id === caseId) : cases;
  if (!selected.length) throw new Error(`Unknown case: ${caseId}`);
  const api = createAIService();
  console.log(`Live model: ${process.env.GEMINI_MODEL || DEFAULT_MODEL}. Cases: ${selected.length}.`);
  let passed = 0;
  for (const entry of selected) {
    let result;
    try {
      result = await api[entry.action || "parse"]({ requestId: `eval_${entry.id}`, messages: entry.messages });
      checkResult(result, entry.expected);
      passed++;
      console.log(`PASS ${entry.id}: ${result.status}`);
    } catch (error) {
      if (error.code && error.code !== "ERR_ASSERTION") {
        console.error(`${entry.id}: ${error.code}: ${error.message}`);
        process.exitCode = 1;
        return; // stop on provider/configuration failures instead of spending more calls
      }
      console.error(`FAIL ${entry.id}: ${error.message}`);
      console.error(JSON.stringify({ draft: result?.draft, questions: result?.questions, unsupportedRequirements: result?.unsupportedRequirements }, null, 2));
    }
  }
  console.log(`${passed}/${selected.length} live cases passed. This is a smoke evaluation, not an accuracy guarantee.`);
  if (passed !== selected.length) process.exitCode = 1;
}

if (require.main === module) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}

module.exports = { checkResult };
