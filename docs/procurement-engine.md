# Procurement engine — catalog, verification & basket optimizer

This component turns a structured purchasing request into complete, budget-checked, constraint-checked baskets with reasons. It **prepares plans only**. It never creates, authorizes or captures a PayPal payment.

```
Request JSON → Catalog → Verification → Basket optimization → Plan response → User review → existing PayPal checkout
 (agent)       src/catalogProvider.js   src/verifier.js   src/optimizer.js   src/planService.js   (frontend)   server.js /api/paypal/*
```

## Run it

Requires Node 20+ (developed on Node 22). No new dependencies were added.

```bash
npm install
npm test              # 47 tests, Node's built-in test runner
npm run demo          # ₹60,000 setup request through the real pipeline, printed as tables
npm run demo -- --write   # also regenerates examples/response-60k-setup.json
npm start             # http://localhost:3000
```

Then call the API:

```bash
curl -X POST http://localhost:3000/api/procurement/plan \
  -H "Content-Type: application/json" \
  --data @examples/request-60k-setup.json
```

On Windows PowerShell, use:

```powershell
Invoke-RestMethod -Method Post -Uri http://localhost:3000/api/procurement/plan `
  -ContentType "application/json" -InFile examples/request-60k-setup.json | ConvertTo-Json -Depth 10
```

## API

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/procurement/plan` | Canonical request → plan (`DRAFT` or `INFEASIBLE`) |
| GET | `/api/procurement/catalog?category=monitor` | Catalog metadata and products |
| GET | `/api/procurement/contract` | Supported hard constraints and scoring formulas |

**Responses from `POST /api/procurement/plan`:**
- **200, `status: "DRAFT"`**: at least one complete feasible basket exists. The baskets are in `strategies`.
- **200, `status: "INFEASIBLE"`**: the request was valid but nothing fits. `strategies` is `{}`. `infeasibility` explains why with real numbers and suggestions, and `rejectedProducts` shows the per-product evidence.
- **400, `INVALID_REQUEST`**: `details: [{ field, message }]`. This covers malformed JSON, a missing body, bad fields, unsupported constraints and invalid weights.
- **503, `CATALOG_UNAVAILABLE`**: the catalog could not be loaded.

The full field list is in [`shared/contracts.json`](../shared/contracts.json). A complete real response is in [`examples/response-60k-setup.json`](../examples/response-60k-setup.json).

### Request rules
- `requestId`, `budgetINR` (more than 0, at most 2 decimals), `maxDeliveryDays` (integer 0–365) and `requiredCategories` (non-empty, quantity 1–100, no duplicates) are required.
- `hardConstraints` keys must belong to a category listed in `requiredCategories`. Each key must be a supported constraint (see `GET /api/procurement/contract`). An unsupported key is rejected rather than silently ignored, because an unchecked "hard" constraint would make the plan dishonest.
- `weights` must contain exactly `quality`, `reliability` and `delivery`. Each must be between 0 and 1, and together they must sum to 1 (±0.001). **They are never normalized.**
  - If `weights` is omitted entirely, the defaults 0.45 / 0.35 / 0.20 are used. In that case `scoring.weightsSource` is `"DEFAULT"` and a warning is returned.
- Items the user already owns (the laptop in the example) are simply not listed in `requiredCategories`, so they are never bought.

## Catalog

The data lives in `src/catalog.json` and is loaded through `createJsonFileCatalogProvider()`. Every record is validated when it loads. An invalid record is skipped with a warning; it does not crash the server.

| Field | Meaning | Unknown |
|---|---|---|
| `productId`, `name`, `category`, `brand` | identity | — |
| `unitPriceINR`, `shippingINR` | rupees, at most 2 decimals. **Shipping is a flat charge per order line, not per unit.** | `null` |
| `stockQuantity`, `deliveryDays`, `warrantyMonths` | integers | `null` |
| `specs` | category specs (`refreshRateHz`, `panel`, `connectivity`, …) | missing key |
| `qualityScore`, `reliabilityScore` | 0–1 | `null` |
| `sourceUrl`, `lastCheckedISO` | evidence; `example.*` domains are refused | `null` |
| `provenance.dataOrigin` | `SYNTHETIC_DEMO` \| `CATALOG_UNCHECKED` \| `SOURCE_VERIFIED` | — |
| `provenance.sourceLookup` | `NOT_CHECKED` \| `FOUND` \| `NOT_FOUND` \| `UNAVAILABLE` | `NOT_CHECKED` |

> ⚠️ **All 37 records in `src/catalog.json` are synthetic demo data.** The brands and products are fictional. Prices, stock, delivery, warranty and scores are illustrative. No record has a source URL or a check timestamp. Some records are deliberately broken to demonstrate rejection:
> - `MON-004`: 75 Hz
> - `MON-005`: refresh rate missing
> - `MON-007`, `KB-006`, `MS-006`, `HP-007`: late delivery
> - `MON-008`, `MS-007`: out of stock
> - `MON-010`: delivery unknown
> - `KB-007`: shipping unknown
> - `KB-009`: stock unknown
> - `MS-008`: no quality score, which only produces a warning
> - `HP-008`: warranty unknown, which only produces a warning

### Plugging in a live source later
Write a provider with the same two methods and pass it in:

```js
const provider = {
  describe: () => ({ providerType: "live-api", catalogId, catalogVersion, dataOrigin: "SOURCE_VERIFIED", disclaimer }),
  async listProducts({ categories }) { /* fetch → raw records */ return { products, loadWarnings }; },
};
app.use("/api/procurement", createProcurementRouter({ catalogProvider: provider }));
```

`normalizeProducts()` in `src/catalogProvider.js` validates raw records for you. A live provider must:
- fill `sourceUrl` and `lastCheckedISO` with real values;
- set `provenance.sourceLookup` honestly (`NOT_FOUND` and `UNAVAILABLE` are kept distinct from `NOT_CHECKED`);
- leave unknown facts as `null`.

The optimizer does not change.

## Verification

Each candidate product gets these mandatory checks, each one `PASS`, `FAIL` or `UNKNOWN`:

| Check | FAIL when | UNKNOWN when |
|---|---|---|
| `price.known` | — | price is null |
| `shipping.known` | — | shipping is null. **It is never assumed to be ₹0** |
| `stock.available` | stock is 0 | stock is null |
| `delivery.withinLimit` | deliveryDays > maxDeliveryDays | deliveryDays is null |
| `constraint.<key>` | the record violates the constraint | the spec is missing or non-numeric |

- **A product is eligible only if every mandatory check is `PASS`.** An `UNKNOWN` is never a pass. Ineligible products appear in `rejectedProducts` with a specific `rejectedReason` and a `rejectionType` of `FAILED_HARD_CONSTRAINT` or `UNVERIFIABLE_MANDATORY_DATA`.
- Price is never a per-product rejection reason. Budget is checked on the whole basket.
- Missing soft data (quality, reliability, warranty) only produces warnings.
- Stock below the requested quantity is a warning. The product can still cover part of a mixed basket, and the optimizer never selects more units than are in stock.

**Evidence status** is reported separately from the checks, in `item.verification.status`:

| Status | Meaning |
|---|---|
| `VERIFIED` | `sourceUrl` present, lookup `FOUND`, checked within 24 h |
| `SOURCE_STALE` | source exists but the last check is older than 24 h |
| `UNVERIFIED` | real catalog data with no fresh source; lookup failures are named in the warnings |
| `UNVERIFIED_DEMO_DATA` | synthetic demo record (everything in the current catalog) |

`constraintSummary` on each strategy is recomputed on the final basket. It is not copied from the per-product checks, and an internal integrity check refuses to emit a plan whose arithmetic or checks don't reconcile.

## Optimization

Every amount is integer **paise** internally, converted back to rupees on output, so there is no floating-point drift.

1. **Category options.** Every way to fill each category's quantity from its eligible products is enumerated. Mixed SKUs are allowed, and each product is bounded by its stock. If a category exceeds 5,000 combinations, the search falls back to options using at most 2 distinct SKUs, and then 1. In that case `search.exhaustive` becomes `false` and a note explains why.
2. **Exact search.** A depth-first search picks one option per category. It prunes exactly on budget (cost so far + cheapest possible remainder > budget) and uses an admissible score bound. Unlike picking the best product per category, it cannot overshoot the budget or miss a better combination. In the demo, the greedy picks would cost ₹67,996; the optimizer finds ₹54,996.

### Scoring (0–1 scale)
```
deliveryScore  = (maxDeliveryDays + 1 − deliveryDays) / (maxDeliveryDays + 1)       // only for on-time products
unitComposite  = wQ·qualityScore + wR·reliabilityScore + wD·deliveryScore          // unknown soft score → 0
basketScore    = mean over required categories of the quantity-weighted mean unitComposite
```
Each required category counts equally. **Price is not in the score.** It enters only as the hard budget limit and the first tie-breaker. No value-for-money weight has been agreed in the contract yet. If the team adds one, it should be a fourth weight, and all four weights must then sum to 1.

### Strategies
| Key | Objective | Tie-breaks |
|---|---|---|
| `CHEAPEST` | lowest total among feasible baskets | higher score → better evidence → product IDs |
| `BEST_VALUE` | highest `basketScore` within budget | lower total → better evidence → product IDs |
| `ALTERNATIVE` | highest score among baskets that change ≥ 2 category picks vs BEST_VALUE, differ from CHEAPEST, and are cheaper **or** better evidenced | same as BEST_VALUE |

No basket is ever returned under two labels. If CHEAPEST would equal BEST_VALUE, or no qualifying ALTERNATIVE exists, that strategy is left out of `strategies` and listed in `omittedStrategies` with a reason. `planId` is a hash of the validated request and the catalog version, so identical inputs give byte-identical responses.

### Money
- `lineTotalINR = unitPriceINR × quantity + shippingINR`
- `totalINR = Σ lineTotalINR = subtotalINR + shippingTotalINR`
- `leftoverBudgetINR = budgetINR − totalINR`, which is never negative for a returned plan
- `paypalSettlementUSD` is always `null` here. The PayPal/FX flow must set it from a real conversion; the optimizer never estimates an exchange rate.

## Files
| File | Role |
|---|---|
| `src/catalog.json` | synthetic demo catalog |
| `src/catalogProvider.js` | record validation, JSON-file and in-memory providers |
| `src/constraintRegistry.js` | supported hard constraints |
| `src/requestValidator.js` | request validation and weight policy |
| `src/verifier.js` | PASS/FAIL/UNKNOWN checks and evidence status |
| `src/scoring.js` | score formulas |
| `src/optimizer.js` | option enumeration and exact search |
| `src/planService.js` | pipeline, response building, integrity checks, infeasibility explanations |
| `src/money.js` | paise helpers |
| `src/routes/procurement.js` | Express router |
| `shared/contracts.json` | shared request/response contract |
| `examples/` | sample request and generated response |
| `scripts/demo-plan.js` | reproducible CLI demo |
| `test/` | unit, oracle (brute-force) and HTTP tests |

## Limitations
- The catalog is synthetic. Nothing is checked against a live retailer yet.
- Delivery is per product. The basket arrives when its slowest item does, and that is not modelled separately.
- Shipping is per line. Per-seller shipping consolidation is not modelled; `seller` is `null` in the demo data.
- Very large quantities across many SKUs switch to the bounded search described above, which is reported via `search.exhaustive`.
