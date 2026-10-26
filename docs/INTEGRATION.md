# ProcureAI — integrating with the procurement engine

**Owner:** catalog, verification and basket optimizer (PR #1, branch `feature/catalog-optimizer`)
**Status:** done, with 63 automated tests passing (`npm test`)
**Reference:** [`docs/procurement-engine.md`](procurement-engine.md) · contract [`shared/contracts.json`](../shared/contracts.json) · real response [`examples/response-60k-setup.json`](../examples/response-60k-setup.json)

```
User text ──► Request agent ──► POST /api/procurement/plan ──► Frontend shows 3 plans + rejected products
                (aiService)          │ stores plan on server             │ user picks one
                                     ▼                                    ▼
                         GET /plans/:id/strategies/:key ◄── /api/plans/:id/approve   (prices from server, not browser)
                                     │                                    │
                         revalidateForCheckout()  ◄──────── /api/paypal/create-order  (VALID → PayPal, else 409)
```

## What the engine gives you

| Endpoint | Use it for |
|---|---|
| `POST /api/procurement/plan` | Request JSON → `CHEAPEST` / `BEST_VALUE` / `ALTERNATIVE` baskets, each with totals, checks, reasons and evidence status, plus `rejectedProducts`. Returns `status: "INFEASIBLE"` with reasons when nothing fits. |
| `GET /api/procurement/plans/:planId` (and `/strategies/:key`) | The server's copy of a plan. This is the source of truth for prices. |
| `POST /api/procurement/plans/:planId/revalidate` | Re-checks the approved basket against the current catalog → `VALID` / `CHANGED` / `INVALID`. |
| `POST/DELETE /api/procurement/demo/catalog-overrides` | Demo only: makes a real price spike or sell-out happen, so the safety check catches a real change. |
| `GET /api/procurement/catalog`, `/contract` | Browse the demo catalog; list the supported hard constraints. |

What the engine guarantees:
- every returned basket covers every category and quantity, fits the budget, and passes every hard constraint;
- the arithmetic is exact (integer paise);
- the same input always gives the same output;
- unknown data never counts as a pass;
- nothing is labelled `VERIFIED` unless a fresh source confirmed it;
- PayPal is never called.

---

## 1 · Request agent (`src/aiService.js`)

Produce this JSON. It is the same as the agreed draft, and `clarificationsNeeded` is accepted and ignored.

```json
{ "requestId": "req_…", "rawQuery": "…", "budgetINR": 60000, "maxDeliveryDays": 7,
  "requiredCategories": [{ "category": "monitor", "quantity": 1 }, …],
  "hardConstraints": { "monitor": { "minRefreshRateHz": 144 } },
  "weights": { "quality": 0.45, "reliability": 0.35, "delivery": 0.20 } }
```

- **Weights must sum to 1.** They are not normalized, so a bad sum returns 400. If you omit `weights`, the defaults are used.
- **Only supported constraint keys work.** A typo returns 400 rather than being silently ignored. The list is at `GET /api/procurement/contract`. Mapping common clarification answers:

| User says | Put in `hardConstraints` |
|---|---|
| "144 Hz", "high refresh" | `monitor.minRefreshRateHz: 144` |
| "1440p only" | `monitor.resolutionIn: ["1440p"]` |
| "27 inch or bigger" | `monitor.minSizeInches: 27` |
| "IPS panel" | `monitor.panelIn: ["IPS"]` |
| "wired mouse" / "wireless" | `mouse.connectivityIn: ["wired"]` |
| "light mouse, under 70 g" | `mouse.maxWeightGrams: 70` |
| "mechanical keyboard" | `keyboard.switchTypeIn: ["linear", "tactile"]` |
| "TKL" | `keyboard.layoutIn: ["TKL"]` |
| "noise cancelling" | `headphones.requireAnc: true` |
| "at least 2-year warranty" | `<category>.minWarrantyMonths: 24` |
| "no brand X" | `<category>.excludedBrands: ["X"]` |

- **Things the user already owns** (the laptop) are left out of `requiredCategories`.
- **Validate before sending** with no HTTP needed: `require("./src/requestValidator").validateRequest(json)` returns `{ ok, errors[] }`. Use `errors` to ask the user a clarifying question.

---

## 2 · Frontend (`client/`)

**Step 1 — add the client.** Copy [`docs/integration/procurementApi.js`](integration/procurementApi.js) to `client/src/api/procurementApi.js`. It is tested against the real server in `test/frontendClient.test.js`.

**Step 2 — replace the hardcoded plans.** Swap `BASE_CATALOG_STRATEGIES` / `REJECTED_PRODUCTS` and the `useMemo` for real data:

```jsx
import { generatePlan, toPlanViewModel, revalidate } from "./api/procurementApi";

const [rawPlan, setRawPlan] = useState(null);   // keep the raw response
const [plan, setPlan] = useState(null);         // view model for rendering
const [loading, setLoading] = useState(false);

async function handleGeneratePlans() {
  setLoading(true); setErrorMsg(null);
  try {
    const request = {
      requestId: `req_${Date.now()}`,
      rawQuery: prompt,
      budgetINR, maxDeliveryDays,
      requiredCategories: Object.entries(quantities).map(([category, quantity]) => ({ category, quantity })),
      hardConstraints: { monitor: { minRefreshRateHz } },
      weights: { quality: 0.45, reliability: 0.35, delivery: 0.2 },
    };
    const raw = await generatePlan(request, API_BASE);
    setRawPlan(raw); setPlan(toPlanViewModel(raw)); setCurrentStep(1);
  } catch (e) {
    setErrorMsg(e.message);   // e.details has field-level validation errors
  } finally { setLoading(false); }
}
```

**Step 3 — rendering changes.** With the view model, most of the existing JSX works as-is.
- Loop `plan.strategies` (an array) instead of `Object.values(planData.strategies)`.
- `item.specs` is already a display string. `strat.withinBudget`, `strat.badgeColor` and `strat.warnings[].message` exist.
- Show `strat.constraintLines` in place of the three hand-written checks.
- Use the badge field: `<Tag color={item.badge.color}>{item.badge.label}</Tag>`.
  - Demo items say **DEMO DATA**.
  - Don't render "VERIFIED" or "FAILED" for them, because the old `renderVerificationBadge` shows FAILED for every non-verified item.
- **If `plan.status === "INFEASIBLE"`:** show `plan.infeasibility.reasons` and `plan.infeasibility.suggestions` instead of cards.
- **Rejected products drawer:** `plan.rejectedProducts` (with `rejectedReason`).
- Show `plan.omittedStrategies[].reason` when there are fewer than 3 cards.
- If `plan.isDemoData`, show one banner: "Demo catalog — prices are illustrative".

**Step 4 — approve.** Send only the IDs; the server looks up the prices:

```js
body: JSON.stringify({ strategyKey, version: 1 })   // no strategyData
```

**Step 5 — price-spike demo (real).** Replace "simulate price change" with:

```js
const monitor = lockedPlan.strategy.items.find(i => i.category === "monitor");
await setDemoOverride({ productId: monitor.productId, unitPriceINR: monitor.unitPriceINR + 2500 }, API_BASE);
const check = await revalidate(lockedPlan.planId, lockedPlan.strategyKey, API_BASE);
// check.status === "CHANGED", check.differenceINR === 2500, check.summary → show it; require re-approval
```

Then do one of two things:
- **Re-approve:** call `clearDemoOverrides()` and approve again.
- **Show a re-plan:** call `generatePlan()` again. The new catalog state produces a new `planId`.

---

## 3 · PayPal / server (`server.js`)

**Step 1 — merge.** When `main` (with this PR) is merged into `role-frontend`, `server.js` and `shared/contracts.json` will conflict.
- **`shared/contracts.json`:** take this PR's version (`git checkout --theirs shared/contracts.json` while merging main into role-frontend). It already includes the frontend draft's `clarificationsNeeded` field.
- **`server.js`:** keep the frontend version and add these three blocks:

```js
// 1) after the other require()s
const { createProcurementRouter, procurementJsonErrorHandler } = require("./src/routes/procurement");
const { getApprovedStrategy, revalidateForCheckout } = require("./src/checkoutGuard");

// 2) right after app.use(express.json());
app.use("/api/procurement", createProcurementRouter());
app.use("/api/procurement", procurementJsonErrorHandler);

// 3) replace the final app.listen(...) so tests can import the app
if (require.main === module) {
  app.listen(PORT, "0.0.0.0", () => console.log(`Server running at http://localhost:${PORT}`));
}
module.exports = app;
```

**Step 2 — approve uses server prices.** In `POST /api/plans/:planId/approve`, replace the `strategyData` / `chosen.items.reduce(...)` logic:

```js
const strategy = getApprovedStrategy(planId, strategyKey);
if (!strategy) return res.status(404).json({ error: "Unknown plan or strategy — generate the plan first." });
const lockedRecord = {
  planId, version: version || 1, status: "APPROVED", approvedStrategyKey: strategyKey,
  strategies: { [strategyKey]: strategy },
  lockedTotalINR: strategy.totalINR,                 // computed by the optimizer in paise, already reconciled
  lockedTotalUSD: (strategy.totalINR * INR_TO_USD_RATE).toFixed(2),
  lockedAtISO: new Date().toISOString(),
};
plansStore.set(planId, lockedRecord);
```

**Step 3 — create-order checks before charging.** At the top of `POST /api/paypal/create-order`, after the `APPROVED` and version checks:

```js
const check = await revalidateForCheckout(planId, plan.approvedStrategyKey);
if (!check || !check.canProceedToCheckout) {
  return res.status(409).json({
    error: "Safety Boundary: basket changed since approval. Re-approve before paying.",
    revalidation: check,              // status CHANGED / INVALID, summary, changes, problems
  });
}
```

**Step 4 — the USD amount.** `paypalSettlementUSD` from the engine is always `null` on purpose. The engine never invents an exchange rate. `INR_TO_USD_RATE = 0.0119` belongs to your flow, so label it in the UI as a "sandbox demo conversion rate".

**Step 5 — credentials.**
- Put the sandbox keys only in a local `.env`. Never put them in `.env.example`, a commit, or a chat.
- Use the names the code reads: `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_BASE_URL=https://api-m.sandbox.paypal.com`.
- Check them with `GET /api/paypal/test-connection`.
- The secret that was committed in `.env.example` must be rotated.

---

## Demo script (for the < 3 min video)

1. **Generate.** Type the ₹60,000 request → 3 plans: Cheapest ₹12,292, Best Value ₹54,996, Alternative ₹50,296.
2. **Explain.** Open Best Value → every item's "why chosen", the 144 Hz check and the constraint lines. Open "Rejected products" → 75 Hz monitor, 10-day delivery, unknown shipping and more.
3. **Point out the optimizer.** Picking the best product in each category would cost ₹67,996, which is over budget; the optimizer finds the best complete basket at ₹54,996.
4. **Lock.** Approve Best Value → locked.
5. **Safety boundary.** Trigger the demo price spike → revalidation says **CHANGED +₹2,500**, PayPal is blocked, the user re-approves.
6. **Pay.** PayPal sandbox payment → capture → receipt.

Offline backup: `npm run demo` and `npm run demo:revalidate` print the same story in the terminal.

## Open decisions for the team

- **Value-for-money weight.** BEST_VALUE does not score price; price is the budget cap and the tie-breaker. If you want price in the score, add a fourth weight, and all four must sum to 1.
- **Strategy names.** The UI draft used `MIN_COST` / `PERFORMANCE_FIRST`, while the engine returns `CHEAPEST` / `ALTERNATIVE`. `toPlanViewModel` handles the display. Rename only if everyone updates together.
- **Submission requirements.** Devpost requires a LICENSE file and a README with setup steps.
