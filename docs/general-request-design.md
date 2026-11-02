# General request intelligence: four phases

**Scope: request intelligence only, response v3.** The authoritative contract is [request-intelligence.md](request-intelligence.md). Our responsibility ends at general purchasing JSON and targeted follow-ups. READY means the user's requirements are clear. Catalog contents, optimization and payment do not determine parsing readiness.

## Phase 1: requirements and boundaries

Handle arbitrary categories of goods, consumables, digital subscriptions and services. A finite test suite cannot cover every possible sentence. Test representative families and explicit edge cases; preserve observed failures without weakening expectations.

| Family | Cases |
|---|---|
| Scope | mixed categories, already-owned products, same-category variants, additions/removals |
| Quantities | singular/plural, number words, fractional bulk units, pairs/packs, missing/zero/negative/large counts |
| Budget | INR k/lakh, currencies, total/per-item, ranges, missing/invalid/unlimited, shipping/tax |
| Delivery | durations, dates, same-day, missing/no deadline, past/conflicting dates, destination |
| Conditions | typed arbitrary specs, units, ranges, brands/warranty, compatibility, hard vs soft |
| Conversation | answers, corrections, removing conditions, preserving earlier requirements |
| Ambiguity | vague items/specs, conflicts, currency/quantity uncertainty, alternatives |
| Intent/input | greetings, unrelated messages, cancellation, injection, malformed/oversized JSON |

Use general `requirements` JSON: intent, items, budget, delivery, globalConstraints, weights, ambiguities and assumptions. Each item retains category, quantity, counting unit and typed constraints. Each constraint has attribute/operator/value/unit/importance/sourceText. A chair's `weightCapacity gte 120 kg` and a laptop's `ramGB gte 16` use the same structure; attributes are not an allowlist.

Return exactly four parsing statuses: READY, NEEDS_CLARIFICATION, NOT_PROCUREMENT and CANCELLED. Missing or conflicting requirements produce questions and retain partial JSON. Completed requests populate `request`. Unrelated input and cancellation do not fabricate a purchasing brief or execute actions.

Ask for essential information, including purchase-critical size, replacement identity or software purpose. Do not ask optional brand/style questions or re-ask explicitly flexible answers. Missing currency cannot be inferred from server geography. Clear per-item budgets, fractional units and arbitrary categories stay valid requirements.

## Phase 2: implementation

Gemini extracts the generic schema. `requestUnderstanding.js` validates it, detects missing information and contradictory conditions, and sets readiness without importing catalog or optimization code. Dates use a server-provided Asia/Kolkata date/time. `POST /api/ai/parse` returns the v3 contract and `GET /api/ai/contract` exposes the handoff schema.

The client displays `nextQuestion`, appends the answer with its question/field label, and parses the whole conversation again. This makes short replies such as "5", "XL" and "yes" interpretable while preserving unaffected earlier requirements. The terminal demo and frontend integration helper use the same format.

## Phases 3 and 4: evaluation and correction

Run deterministic unit/API tests without network access. Run opt-in live Gemini cases across the families above and save failure reports with model, date and case IDs. Separate development cases from held-out paraphrases. Fix general rules without changing expectations merely to pass. Rerun failures during repairs, then the full and held-out suites after changes. Stop on provider/quota failures instead of looping indefinitely. Finite passing cases do not guarantee universal accuracy.

## Failure classes found during development

| Observed failure | Correction / boundary |
|---|---|
| Vague shopping intent classified as unrelated input | Explicitly retain PROCUREMENT intent, budget and deadline while asking for categories |
| Per-item cap stored only as a product attribute | Preserve amount/currency/PER_ITEM in the budget as well; never manufacture a total |
| A mass purchase became an invented package | Raw mass uses a fractional quantity and physical unit; only explicit packs/bags become package counts |
| INR inferred from the server timezone | Currency needs evidence in user messages; date timezone does not establish currency |
| Cross-item condition became a price cap on the wrong item | Preserve a hard purchase relationship and optionality; do not emit an unconditional basket |
| Unit conversion concealed contradictory bounds | Compare converted physical bounds even when one operator is unsupported by v1 |
| Exact equality could be weakened to a minimum | Keep strict, inclusive and exact operators distinct in general JSON |
| Test rejected `cordless_drill` despite correct meaning | Allow that explicit category alias while still checking the count and 18 V requirement; a checker regression test rejects wrong counts/specs |

Current live fixtures contain 75 development cases and eight reserved paraphrases, including labelled follow-up conversations. `reports/ai-evaluation/` retains failures and reruns, including provider errors and incomplete runs. Resuming reuses only validated successes with identical source, model, prompt, schema, messages and expectations, and preserves the original reference time. A provider failure is not counted as a passing case.

## Current parser acceptance, 2026-10-30

Current checks: **129/129 automated tests and 83/83 live cases (75 development + 8 reserved paraphrases)**. [The parser acceptance summary](../reports/ai-evaluation/parser-acceptance-summary.json) records source/prompt/schema hashes and the three-report resume chain. The final invocation made 40 new model calls and reused 43 source-matched successful results following transport interruptions. The tests exercise request understanding and follow-up behavior independently of catalog/optimization.

## Historical v2 acceptance

Before the parser-only scope correction, v2 passed **107/107 deterministic tests, 55/55 development live cases and 8/8 held-out live cases**. See [the historical summary](../reports/ai-evaluation/acceptance-summary.json). These numbers do not verify the current v3 implementation.

The earlier v2 response coupled readiness to compatibility with the existing engine. That coupling has been removed from `/parse`; its old adapter survives only behind the separate legacy `/plan` endpoint. A finite passing suite is not proof of universal accuracy.
