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

// NEEDS_CLARIFICATION -> show questions; append labelled user answers and retry.
// PLANNED -> result.plan is the existing engine's response, ready for comparison.
// INFEASIBLE -> display result.plan.infeasibility; never show a checkout button.
export function generatePlanFromMessages(messages, options) {
  return call("plan", messages, options);
}
