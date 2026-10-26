// Drop-in client for the procurement engine (copy to client/src/api/procurementApi.js).
// Plain ES module, no dependencies: works in Vite/React and in Node 18+.
//
//   import { generatePlan, toPlanViewModel, revalidate } from "./api/procurementApi";
//   const plan = await generatePlan(requestJson);        // raw API response (keep it for /approve)
//   const view = toPlanViewModel(plan);                   // shape the current App.jsx cards expect
//
// See docs/INTEGRATION.md for the full flow.

const DEFAULT_BASE = "http://localhost:3000";

async function call(base, method, path, body) {
  const res = await fetch(`${base}/api/procurement${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({ error: "BAD_RESPONSE", message: `HTTP ${res.status}` }));
  if (!res.ok) {
    const details = Array.isArray(data.details) ? data.details.map((d) => `${d.field}: ${d.message}`).join("; ") : "";
    const err = new Error([data.message || data.error || `HTTP ${res.status}`, details].filter(Boolean).join(" — "));
    err.status = res.status;
    err.code = data.error;
    err.details = data.details || [];
    throw err;
  }
  return data;
}

/** POST /api/procurement/plan. Returns the raw plan (status DRAFT or INFEASIBLE). Throws on 4xx/5xx. */
export function generatePlan(request, base = DEFAULT_BASE) {
  return call(base, "POST", "/plan", request);
}

/** Server-trusted copy of a plan or one strategy. */
export function getPlan(planId, base = DEFAULT_BASE) {
  return call(base, "GET", `/plans/${encodeURIComponent(planId)}`);
}

/** POST /plans/:planId/revalidate -> { status: VALID | CHANGED | INVALID, canProceedToCheckout, summary, ... } */
export function revalidate(planId, strategyKey, base = DEFAULT_BASE) {
  return call(base, "POST", `/plans/${encodeURIComponent(planId)}/revalidate`, { strategyKey });
}

/** Demo only: simulate a retailer change, e.g. { productId: "MON-002", unitPriceINR: 24499 }. */
export function setDemoOverride(change, base = DEFAULT_BASE) {
  return call(base, "POST", "/demo/catalog-overrides", change);
}
export function clearDemoOverrides(base = DEFAULT_BASE) {
  return call(base, "DELETE", "/demo/catalog-overrides");
}

/** UI presentation per strategy key (colours match the current App.jsx). */
export const STRATEGY_UI = {
  CHEAPEST: { badgeColor: "green", order: 0 },
  BEST_VALUE: { badgeColor: "blue", order: 1, recommended: true },
  ALTERNATIVE: { badgeColor: "purple", order: 2 },
};

/** Badge for item.verification.status. Never show "verified" for anything but VERIFIED. */
export const VERIFICATION_BADGE = {
  VERIFIED: { label: "VERIFIED", color: "success" },
  SOURCE_STALE: { label: "SOURCE STALE", color: "warning" },
  UNVERIFIED: { label: "UNVERIFIED", color: "default" },
  UNVERIFIED_DEMO_DATA: { label: "DEMO DATA", color: "default" },
};

/**
 * Maps the API plan to what the existing App.jsx cards read:
 *   strat.withinBudget, strat.badgeColor, strat.warnings[{severity,message}],
 *   item.specs as a display string, readable constraint lines.
 * The original API objects stay available as strat.raw / item.raw.
 */
export function toPlanViewModel(plan) {
  const strategies = Object.values(plan.strategies || {})
    .sort((a, b) => (STRATEGY_UI[a.strategyKey]?.order ?? 9) - (STRATEGY_UI[b.strategyKey]?.order ?? 9))
    .map((s) => {
      const ui = STRATEGY_UI[s.strategyKey] || { badgeColor: "gray" };
      const c = s.constraintSummary;
      return {
        ...s,
        raw: s,
        badgeColor: ui.badgeColor,
        recommended: Boolean(ui.recommended),
        withinBudget: s.withinBudget ?? c.budgetCheck === "PASSED",
        warnings: s.warnings.map((message) => ({ severity: "WARNING", message })),
        constraintLines: [
          `Budget: ${c.budgetCheck} (₹${s.totalINR.toLocaleString("en-IN")} of ₹${plan.budgetINR.toLocaleString("en-IN")})`,
          `All categories & quantities: ${c.categoryCoverageCheck}`,
          `Mandatory specs: ${c.mandatorySpecCheck}`,
          `Delivery: ${c.deliveryCheck}`,
          `Stock: ${c.stockCheck}`,
        ],
        items: s.items.map((i) => ({
          ...i,
          raw: i,
          specs: i.specsSummary ?? Object.values(i.specs || {}).join(" · "),
          badge: VERIFICATION_BADGE[i.verification.status] || { label: i.verification.status, color: "default" },
        })),
      };
    });

  return {
    planId: plan.planId,
    status: plan.status, // DRAFT | INFEASIBLE
    budgetINR: plan.budgetINR,
    strategies, // array, already ordered CHEAPEST, BEST_VALUE, ALTERNATIVE
    strategiesByKey: Object.fromEntries(strategies.map((s) => [s.strategyKey, s])),
    omittedStrategies: plan.omittedStrategies || [],
    infeasibility: plan.infeasibility, // { reasons[], suggestions[] } when INFEASIBLE
    rejectedProducts: plan.rejectedProducts || [],
    warnings: plan.warnings || [],
    isDemoData: plan.catalog?.dataOrigin === "SYNTHETIC_DEMO",
  };
}
