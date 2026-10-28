# Request intelligence — Task 1

This module turns user messages into the team's existing `ProcurementRequest` JSON. It asks for missing requirements, then hands the complete request to the existing verifier/optimizer and returns its actual baskets. It does not generate product prices or authorize payment.

## Run

Requires the repo's Node.js 20+ environment. No new npm dependencies.

1. Run `npm ci` (`npm.cmd ci` in Windows PowerShell).
2. Copy `.env.example` to `.env` if it does not exist.
3. Create a Gemini API key in [Google AI Studio](https://aistudio.google.com/apikey). Put it in **the server's local `.env`** as `GEMINI_API_KEY=...`. Do not send keys in chat or put them in a `VITE_` variable.
4. Set `GEMINI_MODEL` to a model available to that key. Default: `gemini-3.5-flash-lite`. Restart the server after changing environment settings.
5. `npm run demo:ai -- --sample` prints extraction + actual optimizer output for the agreed ₹60,000 example. `npm run demo:ai` runs a terminal conversation. Add `--parse` to stop at request JSON.
6. `npm start` exposes the HTTP endpoints below. `GET /api/ai/status` reports whether a key is set; it does **not** prove the key works.

PayPal credentials are separate and are unnecessary for request extraction or basket planning. Only HTTP 503 overload responses are retried: at most three retries after 2, 4 and 8 seconds. One 30-second deadline covers all attempts and waits. Invalid requests, authentication errors, quota errors and incomplete model outputs return immediately. Account/model quotas and any charges depend on your Gemini project; check [active limits](https://ai.google.dev/gemini-api/docs/rate-limits) before making the demo public.

## API contract

| Method | Path | Result |
|---|---|---|
| GET | `/api/ai/status` | Configuration flag, provider/model ID, supported categories; no secret |
| POST | `/api/ai/parse` | `READY` with canonical JSON, or `NEEDS_CLARIFICATION` |
| POST | `/api/ai/plan` | Same clarification behavior; complete requests return `PLANNED` or `INFEASIBLE` with the optimizer response |

Both POST endpoints take the same body:

Saved inputs for API clients: [`examples/ai-request.json`](../examples/ai-request.json) and [`examples/ai-followup.json`](../examples/ai-followup.json).

```json
{
  "requestId": "req_2026_01",
  "messages": [
    "I need a complete setup for coding and gaming under ₹60,000. I already own a laptop. I need a 144 Hz monitor, keyboard, mouse and headphones. Prioritize value for money, reliability and delivery within a week."
  ]
}
```

`requestId` is optional; the server generates it when omitted. `messages` contains **user turns only**, in order: 1–20 non-empty strings, at most 8,000 characters each and 16,000 total. Do not send a previously generated draft as input. The service re-extracts all user turns each time, avoiding a separate conversation database and unvalidated client-side JSON merges.

Every success response has these fields:

```json
{
  "requestId": "req_2026_01",
  "status": "NEEDS_CLARIFICATION",
  "request": null,
  "draft": {
    "budgetINR": null,
    "maxDeliveryDays": null,
    "requiredCategories": [{ "category": "monitor", "quantity": 1 }],
    "hardConstraints": {},
    "weights": null,
    "ambiguities": [],
    "unsupportedRequirements": [],
    "assumptions": []
  },
  "questions": [
    { "field": "budgetINR", "question": "What is your total budget in INR, including shipping?" },
    { "field": "maxDeliveryDays", "question": "Within how many days do you need all items delivered?" }
  ],
  "unsupportedRequirements": [],
  "assumptions": ["Default scoring weights: quality 0.45, reliability 0.35, delivery 0.20. Price is a budget cap and tie-breaker; CHEAPEST minimizes cost separately."],
  "plan": null,
  "recommendation": null
}
```

For that example, submit a follow-up as:

```json
{
  "requestId": "req_2026_01",
  "messages": ["I need a monitor.", "Total budget INR 20000; deliver within 7 days."]
}
```

The original request is preserved in `request.rawQuery`, followed by labelled follow-up turns. `READY` means the canonical JSON is valid and no declared ambiguity/unsupported requirement remains. Parsing alone does not check product availability.

`PLANNED` includes `request` in the agreed shape, `plan` in the existing [shared contract](../shared/contracts.json), and a deterministic `recommendation` containing the recommended strategy key, exact total, remaining budget, evidence status and `requiresUserApproval: true`. The engine still decides whether all three strategies have distinct feasible baskets. `INFEASIBLE` includes `plan.infeasibility` and no recommendation.

Errors use `{ error, message, details? }`: 400 `INVALID_AI_REQUEST`, 413 oversized JSON, 503 `AI_NOT_CONFIGURED` / `AI_UNAVAILABLE` / `AI_OVERLOADED` / `CATALOG_UNAVAILABLE`, 429 `AI_RATE_LIMITED`, 504 `AI_TIMEOUT`, 502 `AI_INVALID_OUTPUT` / `AI_PROVIDER_ERROR`. Never continue to hardcoded plans after one of these errors.

## Frontend handoff — teammate 3

Copy [requestIntelligenceApi.js](integration/requestIntelligenceApi.js) to your frontend API folder. Keep user messages and the returned request ID in React state:

```js
const result = await generatePlanFromMessages(messages, { requestId, base: API_BASE });
setRequestId(result.requestId);
if (result.status === "NEEDS_CLARIFICATION") {
  setQuestions(result.questions);
  // Render unsupportedRequirements too. Append the user's labelled answer to
  // messages and call again. Do not enable plan comparison or checkout yet.
} else if (result.status === "INFEASIBLE") {
  setInfeasibility(result.plan.infeasibility);
} else {
  setRawPlan(result.plan);
  setPlan(toPlanViewModel(result.plan)); // existing procurementApi.js adapter
}
```

For a separate "Extract & Review" button, call `parseRequirements(messages, options)`. The returned `request` can be shown as JSON or reviewed before sending it to the existing `/api/procurement/plan` endpoint. If structured form edits are used, validate and submit those edits through the existing endpoint; do not silently ignore them.

Plans created by `/api/ai/plan` are saved in the **same server plan store** as `/api/procurement/plan`. No frontend plan registration is needed. Continue with the engine's `planId` and strategy key. The existing frontend still renders hardcoded baskets and the separate PayPal store still needs the checkout integration described in [INTEGRATION.md](INTEGRATION.md); Task 1 does not make those paths authoritative.

## Extraction policies and limits

- Budget, categories, uncertain quantities and deadline must be resolved before optimization. Singular item lists mean one each; ambiguous plural quantities remain unknown. An explicit lack of deadline maps to the engine's 365-day horizon with a disclosed assumption.
- The prompt instructs the model to interpret `3 lakh` as 300000 INR, exclude already-owned equipment, preserve earlier constraints, and apply the latest explicit correction. Currency conversions and ambiguous calendar dates require clarification.
- General use cases (coding, gaming, office work) are background context. An explicit item list defines the scope even when described as a "complete setup". Scope notes belong in `assumptions`; only specific unsupported mandatory conditions belong in `unsupportedRequirements`. Without a list, "complete setup" still needs a category question. Explicit laptop/monitor HDMI compatibility remains a blocker.
- Exact defaults are the agreed weights `0.45/0.35/0.20`, disclosed in `assumptions`. Strong quality/reliability/delivery preferences use documented weight presets in the extraction prompt. Explicit invalid weights cause questions rather than silent normalization. BEST_VALUE uses the existing engine's weighted score; CHEAPEST handles price minimization.
- The extraction schema and supported keys are derived from `constraintRegistry.js`. Gemini receives a copy without `maxItems` and `minimum` bounds because the full bounded schema produced HTTP 400 in live testing. Field shapes, types, required keys and supported constraint names remain in the provider schema. The server still enforces the original strict schema and canonical request validity, including array bounds and non-negative constraint values.
- Current categories: monitor, keyboard, mouse, headphones. A request for **5 laptops / 16 GB RAM / ₹3 lakh** is blocked with unsupported requirements. To support it, teammate 2 must add laptop catalog records and RAM rules to the registry/verifier; request intelligence will discover the registry keys. Check/update the laptop-specific prompt example at that time.
- Compatibility, delivery to a specific postcode, and other unsupported mandatory conditions must appear as blockers. Soft preferences outside the score are disclosed rather than claimed as optimized.
- LLM interpretation can still omit or misread a requirement. Schema validation guarantees structure and supported keys, **not semantic accuracy**. Show the extracted brief for user review; evaluate real prompts with your chosen model before the demo.
- Catalog records remain **synthetic demo data** and are labelled `UNVERIFIED_DEMO_DATA`. This module preserves that evidence status. It never claims retailer verification.

## Implementation and verification

| File | Responsibility |
|---|---|
| `src/aiService.js` | Input bounds, missing-field questions, validation, optimizer handoff and deterministic recommendation |
| `src/requestExtraction.js` | Extraction JSON schema, local schema checks and interpretation prompt |
| `src/geminiExtractor.js` | Gemini REST call, bounded timeout, structured output and safe provider errors |
| `src/routes/ai.js` | Express endpoints and JSON error responses |
| `scripts/demo-ai.js` | Terminal conversation or one-shot live demo |

Use `npm test`. The request-intelligence tests inject model outputs and mock Gemini HTTP responses. They exercise real optimizer/store behavior but **do not measure live model extraction accuracy**. A live smoke test requires a Gemini key:

```bash
npm run demo:ai -- --sample --parse
npm run demo:ai -- --sample
```

Then try missing budget, missing categories, a correction in the next turn, the laptop/RAM example, and an impossible budget. Check the extracted JSON as well as the returned baskets.

For a repeatable live check, run `npm run test:ai:live`. It evaluates the nine fixed conversations in `test/fixtures/ai-live-cases.json`: the original setup, a context paraphrase, missing budget/deadline, missing categories, missing quantities, follow-up corrections, unsupported laptop/RAM/warranty, mandatory HDMI compatibility, and withdrawal of that condition. The original setup also runs the real optimizer and checks its expected totals. Run one case with `npm run test:ai:live -- original-setup`.

This command uses your Gemini key and spends one extraction call per case, plus any bounded 503 retries. It is separate from `npm test`, stops on provider/configuration errors, and exits nonzero on a failed expectation. Passing these examples is smoke-test evidence for this prompt/model combination, not a guarantee for arbitrary wording.

Recorded local smoke evaluation on 2026-10-29 with `gemini-3.5-flash-lite`: **9/9 cases passed**. The original setup reached `PLANNED` with demo-catalog totals of INR 12,292 / 54,996 / 50,296. Missing plural quantities required clarification; unsupported laptop quantities, RAM and warranty were retained; explicit HDMI compatibility blocked planning and an explicit withdrawal removed that blocker. General context and an explicit complete-setup item list did not create false blockers.

API reference used: [Gemini generateContent](https://ai.google.dev/api/generate-content), [structured outputs](https://ai.google.dev/gemini-api/docs/structured-output), [models](https://ai.google.dev/gemini-api/docs/models). The API key is sent in a header; provider error bodies and user prompts are not logged by this module.
