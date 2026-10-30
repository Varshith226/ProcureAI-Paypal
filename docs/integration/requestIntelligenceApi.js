// Copy this ES module into client/src/api/ when wiring the request screen.
// Send user turns in order. Keep the returned requestId for follow-up answers.

async function call(action, messages, {
  base = "http://localhost:3000", requestId, signal,
} = {}) {
  const response = await fetch(`${base}/api/ai/${action}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, ...(requestId ? { requestId } : {}) }), signal,
  });
  let data;
  try { data = await response.json(); } catch {
    throw new Error(`Request intelligence returned an unreadable response (HTTP ${response.status}).`);
  }
  if (!response.ok) {
    const error = new Error(data.message || `HTTP ${response.status}`);
    error.code = data.error;
    error.status = response.status;
    error.details = data.details || [];
    throw error;
  }
  return data;
}

export function parseRequirements(messages, options) {
  return call("parse", messages, options);
}

// Ask one returned question at a time. The label makes short answers such as
// "7" or "yes" unambiguous without changing the user-message API.
export function appendClarificationAnswer(messages, question, answer) {
  if (!question?.field || !question?.question || typeof answer !== "string" || !answer.trim()) throw new Error("A question and non-empty answer are required.");
  return [...messages, `Answer to clarification (${question.field}): ${question.question}\nMy answer: ${answer.trim()}`];
}

// Legacy planning bridge only. Use parseRequirements + nextQuestion for request
// intelligence and hand its READY request to the new optimizer contract.
// NEEDS_CLARIFICATION -> show questions; append labelled user answers and retry.
// PLANNED -> result.plan is the existing engine's response, ready for comparison.
// INFEASIBLE -> display result.plan.infeasibility; never show a checkout button.
// ENGINE_SUPPORT_REQUIRED -> show result.requirements and unsupportedRequirements.
// NOT_PROCUREMENT / CANCELLED -> no purchasing plan or checkout.
export function generatePlanFromMessages(messages, options) {
  return call("plan", messages, options);
}
