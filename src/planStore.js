"use strict";

/**
 * In-memory store of plans this server generated.
 *
 * Why it exists: the browser must never be the source of truth for prices.
 * The PayPal approve/checkout flow should look the plan up here (or via
 * GET /api/procurement/plans/:planId) by planId + strategyKey, instead of
 * trusting item prices sent from the client.
 *
 * Plans are deep-frozen copies, so nobody can mutate a stored plan by accident.
 * Oldest plans are evicted after `maxPlans` (default 500). Restarting the
 * server clears the store; swap this module for a database when that matters.
 */

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value)) deepFreeze(v);
  }
  return value;
}

function createPlanStore({ maxPlans = 500 } = {}) {
  const plans = new Map(); // planId -> { plan, request, storedAtISO }

  return {
    /** Stores a plan together with the validated request it was built from. */
    save(plan, request) {
      if (!plan || typeof plan.planId !== "string") throw new Error("plan.planId is required");
      plans.delete(plan.planId); // re-insert to refresh eviction order
      plans.set(plan.planId, deepFreeze({ plan: structuredClone(plan), request: structuredClone(request), storedAtISO: new Date().toISOString() }));
      while (plans.size > maxPlans) plans.delete(plans.keys().next().value);
    },
    /** Returns { plan, request, storedAtISO } or null. */
    get(planId) {
      return plans.get(planId) || null;
    },
    /** Returns the stored strategy (frozen) or null. */
    getStrategy(planId, strategyKey) {
      const entry = plans.get(planId);
      return entry?.plan?.strategies?.[strategyKey] || null;
    },
    size: () => plans.size,
    clear: () => plans.clear(),
  };
}

/** Shared default store used by the procurement router (and importable by the PayPal flow). */
const planStore = createPlanStore();

module.exports = { createPlanStore, planStore };
