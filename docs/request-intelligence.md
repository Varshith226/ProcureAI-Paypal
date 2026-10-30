# Request intelligence and follow-up questions — response v3

Our responsibility is: **user messages -> understand purchasing intent -> ask necessary questions -> complete general JSON**. Completion does not depend on catalogs, product availability, INR pricing, quantity limits, verification rules or optimizer capabilities. The optimizer owner consumes the completed request and builds on it.

## Run and API

Node.js 20+, existing dependencies only. Run `npm ci`, configure server-only `GEMINI_API_KEY` in ignored `.env`, then `npm start`. Default `GEMINI_MODEL=gemini-3.5-flash-lite`. `npm run demo:ai` opens the parsing conversation; `npm run demo:ai -- --sample` prints the original example as general JSON. The demo now always parses; it does not optimize or pay.

| Endpoint | Purpose |
|---|---|
| `POST /api/ai/parse` | Parse user turns and return general JSON or follow-up questions |
| `GET /api/ai/contract` | Schema, input limits and parser statuses |
| `GET /api/ai/status` | Model/configuration flag, scope REQUEST_INTELLIGENCE; no key or category allowlist |

Input: `{ "requestId": "optional-id", "messages": ["user request", "user answer"] }`. Send user turns in order. A request ID is generated if omitted. Bounds: 1–100 non-empty messages, <=8,000 characters each, <=16,000 total, ID <=128 characters. The larger turn count supports multi-step clarification while keeping a bounded total prompt size.

## Completion means understanding

| Status | Meaning |
|---|---|
| `READY` | The user's purchasing requirements are sufficiently clear. `request` is the completed general JSON. |
| `NEEDS_CLARIFICATION` | Information is missing, invalid or contradictory. `request:null`; partial information remains in `requirements`. |
| `NOT_PROCUREMENT` | Greeting/unrelated input, with a short invitation to state purchasing needs. No fabricated basket. |
| `CANCELLED` | The user cancelled their purchasing brief. No order, payment or refund action is executed. |

Response fields: `contractVersion:3`, `requestId`, `status`, `request`, `requirements`, `questions`, `nextQuestion`, `assumptions`, `referenceDate`, and a short `message` for unrelated/cancelled input. Each question has `field` and `question`. `nextQuestion` is the first unresolved question, or null when complete. The parser does not return engine-support blockers, product recommendations or feasibility claims.

`READY` can include 500 chairs, USD pricing, fractional kg, an unlimited budget, per-item caps, taxes, destination-specific needs, conditional/optional purchases, or any other clearly expressed attributes. These remain requirements for downstream work, not reasons to interrogate the user or reject a category.

## General request JSON

The completed `request` includes `requestId`, `rawQuery` and these schema fields:

The optimizer owner can use [the completed-request JSON Schema](../shared/request-intelligence.schema.json), also returned as `completedRequestSchema` by `/api/ai/contract`. The verified [chair input](../examples/request-chairs.json) and [READY response](../examples/response-chairs.json) illustrate the handoff. Partial extraction uses the separate `requirementsSchema`.

| Field | Contents |
|---|---|
| `intent` | PROCUREMENT / NON_PROCUREMENT / CANCEL |
| `items` | category, quantity, unit, required flag, typed constraints |
| `budget` | amount, minimum, currency, TOTAL/PER_ITEM/UNKNOWN scope, unlimited flag, shipping/tax inclusion |
| `delivery` | duration in days (including fractions), date or timestamp, flexible/no deadline flag, destination |
| `globalConstraints` | Requirements applying to all items or relationships between purchases |
| `weights` | Only explicitly supplied numeric quality/reliability/delivery weights; otherwise null |
| `ambiguities` | Specific unresolved meaning/conflicts, phrased as questions |
| `assumptions` | Disclosed context or interpretation notes |

Each condition is `{ attribute, operator, value, unit, importance, sourceText }`. Attributes are arbitrary strings; values are typed numbers/strings/booleans/arrays. Operators are gt/gte/lt/lte/eq/in/not_in/between/contains. HARD and SOFT are distinct. `sourceText` quotes the user's words. A chair can carry `weightCapacity gte 120 kg`; a shirt can carry size XL; a freezer can carry temperature lte -20 C. No category-specific optimizer schema is required.

## Correct follow-up flow

1. Call `parseRequirements(messages, {requestId})` using [requestIntelligenceApi.js](integration/requestIntelligenceApi.js).
2. If NEEDS_CLARIFICATION, display `nextQuestion.question`.
3. Append the user's answer using `appendClarificationAnswer(messages, nextQuestion, answer)`.
4. Call `/parse` again with the updated messages and same request ID.
5. Repeat until READY. Send `result.request` to the optimizer owner as the completed general request.

Example labelled turn:

```text
Answer to clarification (items[0].quantity): How many chairs do you need?
My answer: 5
```

The label makes "5", "yes", "XL" or "no cap" interpretable without guessing which question it answers. Unaffected earlier requirements must survive every answer. Explicit corrections/removals replace only the relevant detail. The CLI asks one returned question at a time and applies the same label.

## Asking where necessary

- Missing categories, counts, units, budget/currency/scope, or delivery expectations require a question. Budget/currency are combined when both are absent. Explicit no spending cap or flexible delivery are complete answers; no artificial limits are inserted.
- A shirt/shoe size, replacement cartridge model, software purpose, or unspecified ticket/booking identity can be purchase-critical. Ask these rather than assuming. Common deterministic safeguards back up the model's clarification decisions; they are not category allowlists.
- Vague mandatory numeric language ("high refresh", "lightweight") must not become an invented number. Ask the actual threshold. Optional qualitative preferences remain optional and can remain qualitative.
- Do not ask optional brand/colour/style questions without a reason. Explicit "any size", "any brand" and "either is fine" resolve that detail; do not repeat it.
- Raw mass stays a mass quantity; packaging is introduced only when requested. Per-item caps, currencies and decimal precision are preserved. The parser never manufactures a total, FX rate or product price.
- Global and item conditions are checked together for contradictions, including strict inequalities and common unit conversions. Preserve conflicting statements while asking which should apply.
- Relative dates use the supplied server date/time in Asia/Kolkata. Explicit clock deadlines preserve ISO offsets. Ambiguous calendar formats or past deadlines require clarification.
- Greetings/unrelated questions are classified and redirected to purchasing requirements; this is not a general-purpose question-answering chatbot.

## Verification and evidence

`npm test` runs deterministic parser/schema/API/provider tests and retained legacy regression tests without model calls. `npm run test:ai:live -- --suite=all` runs the parser-only live acceptance suite. Use `--suite=development` or `--suite=heldout`, or list specific case IDs for repairs.

Current fixtures: `ai-parser-cases.json` and `ai-parser-heldout-cases.json`. They cover product families, ambiguity, quantities/units, scope, currencies, deadlines, identity/size requirements, conditions, corrections, labelled short answers and non-shopping input. Live runs freeze the reference time, pause between calls, stop on provider errors, and save model, prompt/schema hashes, failed outputs and reruns under `reports/ai-evaluation/`. Failed runs remain available.

Verified on 2026-10-30 with `gemini-3.5-flash-lite`: **129/129 automated tests and 83/83 live cases (75 development + 8 reserved paraphrases)**. See [parser-acceptance-summary.json](../reports/ai-evaluation/parser-acceptance-summary.json) for source/prompt/schema hashes and the complete live report. The final invocation made 40 new model calls and reused 43 validated passes from source-matched interrupted runs. Provider timeouts and earlier semantic failures remain recorded rather than counted as passes.

Historical v2 reports/`acceptance-summary.json` included optimizer compatibility. They are not evidence for the current parser-only contract. A finite passing suite is measured coverage, not a guarantee for every possible sentence; new failures should become regression cases.

After a transport/quota interruption, `npm run test:ai:live -- --resume=reports/ai-evaluation/REPORT.json` reuses only validated successful cases with matching input, expectations, model, prompt, schema and parser source. It preserves the original frozen date/time and report provenance. Failed or changed cases call the model again. Changing parsing behavior invalidates cached passes; earlier interrupted reports remain intact.

## Scope and compatibility

The generic parser and schema have no dependency on the catalog, constraint registry, plan service or optimizer. The old `/api/ai/plan` endpoint remains a separate optional compatibility bridge for existing consumers; it lazily invokes the v1 adapter only when explicitly called. Its statuses and payload are not parsing-readiness rules. The existing frontend/PayPal code is outside this request-intelligence task. Use the v3 `/parse` contract for the new optimizer handoff.

Keys stay in server `.env`. Provider error bodies and prompts are not logged by our adapter. Only HTTP 503 retries after 2/4/8 seconds within a total 30-second deadline; other provider errors are returned without fake results.
