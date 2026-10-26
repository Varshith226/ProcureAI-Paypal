"use strict";

/**
 * Deterministic basket optimizer.
 *
 * Input (built by planService from verified, eligible products):
 *   categories: [{ category, quantity, candidates: [Candidate] }]
 *   Candidate:  { product, unitPaise, shippingPaise, scores: {quality, reliability, delivery, composite}, evidenceCompleteness }
 *   budgetPaise: integer
 *
 * Approach
 * 1. Per category, enumerate every way to fill the requested quantity from the
 *    eligible products (mixed SKUs allowed, each bounded by its stock). If that
 *    would exceed OPTION_LIMIT_PER_CATEGORY, fall back to at most 2 distinct
 *    SKUs, then to single-SKU options, and report the search as non-exhaustive.
 * 2. Depth-first search over one option per category with exact budget pruning
 *    (current cost + cheapest possible remainder > budget => prune) and an
 *    admissible bound for the objective. This is an exact search over the
 *    enumerated options, so it never misses a better complete basket the way
 *    a per-category greedy pick can.
 *
 * Money is integer paise throughout. Scores are floats compared with EPS.
 * Tie-breaking is a total order, so identical inputs give identical results.
 */

const EPS = 1e-9;
const OPTION_LIMIT_PER_CATEGORY = 5000;
const MAX_BASKETS_EVALUATED = 2_000_000;

function enumerateOptions(candidates, quantity, maxDistinct, limit) {
  const sorted = [...candidates].sort((a, b) => cmpStr(a.product.productId, b.product.productId));
  const options = [];
  let overflow = false;
  const lines = [];

  (function rec(i, remaining, distinct) {
    if (overflow) return;
    if (remaining === 0) {
      if (options.length >= limit) {
        overflow = true;
        return;
      }
      options.push(buildOption(lines, quantity));
      return;
    }
    if (i === sorted.length || distinct === maxDistinct) return;
    const cand = sorted[i];
    const maxQty = Math.min(cand.product.stockQuantity, remaining);
    for (let q = maxQty; q >= 1; q--) {
      lines.push({ cand, quantity: q });
      rec(i + 1, remaining - q, distinct + 1);
      lines.pop();
      if (overflow) return;
    }
    rec(i + 1, remaining, distinct);
  })(0, quantity, 0);

  return { options, overflow };
}

function buildOption(lines, quantity) {
  let costPaise = 0;
  let composite = 0;
  let quality = 0;
  let reliability = 0;
  let delivery = 0;
  let evidence = 0;
  for (const { cand, quantity: q } of lines) {
    costPaise += cand.unitPaise * q + cand.shippingPaise; // shipping: once per order line
    composite += cand.scores.composite * q;
    quality += cand.scores.quality * q;
    reliability += cand.scores.reliability * q;
    delivery += cand.scores.delivery * q;
    evidence += cand.evidenceCompleteness * q;
  }
  return {
    lines: lines.map((l) => ({ cand: l.cand, quantity: l.quantity })),
    costPaise,
    score: composite / quantity,
    breakdown: { quality: quality / quantity, reliability: reliability / quantity, delivery: delivery / quantity },
    evidence: evidence / quantity,
    key: lines.map((l) => `${l.cand.product.productId}x${l.quantity}`).join("+"),
  };
}

function cmpStr(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Builds per-category option lists. Returns { perCategory, exhaustive, notes }. */
function buildCategoryOptions(categories) {
  const notes = [];
  let exhaustive = true;
  const perCategory = categories.map(({ category, quantity, candidates }) => {
    const levels = [quantity, 2, 1].filter((d, i, arr) => d >= 1 && d <= quantity && arr.indexOf(d) === i);
    for (const maxDistinct of levels) {
      const { options, overflow } = enumerateOptions(candidates, quantity, maxDistinct, OPTION_LIMIT_PER_CATEGORY);
      if (!overflow) {
        if (maxDistinct < quantity) {
          exhaustive = false;
          notes.push(
            `${category}: too many mixed-product combinations for ${quantity} units; search limited to baskets using at most ${maxDistinct} different product(s) in this category.`
          );
        }
        options.sort((a, b) => a.costPaise - b.costPaise || cmpStr(a.key, b.key));
        return { category, quantity, options };
      }
    }
    // Even single-SKU options overflowed (practically impossible: one option per product).
    exhaustive = false;
    notes.push(`${category}: option enumeration exceeded its limit; results may be incomplete.`);
    const { options } = enumerateOptions(candidates, quantity, 1, OPTION_LIMIT_PER_CATEGORY);
    options.sort((a, b) => a.costPaise - b.costPaise || cmpStr(a.key, b.key));
    return { category, quantity, options };
  });
  return { perCategory, exhaustive, notes };
}

function makeBasket(perCategory, chosen) {
  const n = perCategory.length;
  let costPaise = 0;
  let scoreSum = 0;
  let evidenceSum = 0;
  const breakdown = { quality: 0, reliability: 0, delivery: 0 };
  for (const opt of chosen) {
    costPaise += opt.costPaise;
    scoreSum += opt.score;
    evidenceSum += opt.evidence;
    breakdown.quality += opt.breakdown.quality / n;
    breakdown.reliability += opt.breakdown.reliability / n;
    breakdown.delivery += opt.breakdown.delivery / n;
  }
  return {
    costPaise,
    score: scoreSum / n,
    breakdown,
    evidence: evidenceSum / n,
    key: chosen.map((o) => o.key).join("|"),
    selections: perCategory.map((c, i) => ({ category: c.category, quantity: c.quantity, option: chosen[i] })),
  };
}

const COMPARATORS = {
  /** Highest composite score; then cheaper; then better evidence; then product IDs. */
  score(a, b) {
    if (a.score > b.score + EPS) return -1;
    if (b.score > a.score + EPS) return 1;
    if (a.costPaise !== b.costPaise) return a.costPaise - b.costPaise;
    if (a.evidence > b.evidence + EPS) return -1;
    if (b.evidence > a.evidence + EPS) return 1;
    return cmpStr(a.key, b.key);
  },
  /** Lowest total; then higher score; then better evidence; then product IDs. */
  cost(a, b) {
    if (a.costPaise !== b.costPaise) return a.costPaise - b.costPaise;
    if (a.score > b.score + EPS) return -1;
    if (b.score > a.score + EPS) return 1;
    if (a.evidence > b.evidence + EPS) return -1;
    if (b.evidence > a.evidence + EPS) return 1;
    return cmpStr(a.key, b.key);
  },
};

/**
 * Exact search for the best basket under `objective` ("score" | "cost"),
 * restricted to baskets accepted by `filter(basket)`.
 */
function searchBest(perCategory, budgetPaise, objective, filter = null) {
  const n = perCategory.length;
  const compare = COMPARATORS[objective];
  const minCostFrom = new Array(n + 1).fill(0);
  const maxScoreFrom = new Array(n + 1).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    const opts = perCategory[i].options;
    minCostFrom[i] = minCostFrom[i + 1] + opts[0].costPaise; // options sorted by cost asc
    maxScoreFrom[i] = maxScoreFrom[i + 1] + Math.max(...opts.map((o) => o.score));
  }

  let best = null;
  let evaluated = 0;
  let truncated = false;
  const chosen = new Array(n);

  (function dfs(i, cost, scoreSum) {
    if (truncated) return;
    if (i === n) {
      evaluated++;
      if (evaluated > MAX_BASKETS_EVALUATED) {
        truncated = true;
        return;
      }
      const basket = makeBasket(perCategory, chosen);
      if (filter && !filter(basket)) return;
      if (!best || compare(basket, best) < 0) best = basket;
      return;
    }
    for (const opt of perCategory[i].options) {
      const newCost = cost + opt.costPaise;
      if (newCost + minCostFrom[i + 1] > budgetPaise) break; // sorted by cost: nothing later fits either
      if (best) {
        if (objective === "cost" && newCost + minCostFrom[i + 1] > best.costPaise) break;
        if (objective === "score" && (scoreSum + opt.score + maxScoreFrom[i + 1]) / n < best.score - EPS) continue;
      }
      chosen[i] = opt;
      dfs(i + 1, newCost, scoreSum + opt.score);
      if (truncated) return;
    }
  })(0, 0, 0);

  return { best, evaluated: Math.min(evaluated, MAX_BASKETS_EVALUATED), truncated };
}

/** Number of categories in which two baskets pick a different product/quantity mix. */
function categoriesChanged(a, b) {
  return a.selections.filter((s, i) => s.option.key !== b.selections[i].option.key).map((s) => s.category);
}

/**
 * Runs all strategies.
 * Returns {
 *   feasible, minimumPossibleCostPaise,
 *   bestValue, cheapest, alternative,   (baskets or null)
 *   omitted: [{ strategyKey, reason }],
 *   search: { exhaustive, basketsEvaluated, notes }
 * }
 */
function optimize(categories, budgetPaise) {
  const { perCategory, exhaustive: enumExhaustive, notes } = buildCategoryOptions(categories);
  const omitted = [];
  const empty = perCategory.filter((c) => c.options.length === 0).map((c) => c.category);
  if (empty.length) {
    return {
      feasible: false,
      emptyCategories: empty,
      minimumPossibleCostPaise: null,
      bestValue: null,
      cheapest: null,
      alternative: null,
      omitted,
      search: { exhaustive: enumExhaustive, basketsEvaluated: 0, notes },
    };
  }

  const minimumPossibleCostPaise = perCategory.reduce((s, c) => s + c.options[0].costPaise, 0);
  const cheapestByCategory = perCategory.map((c) => ({ category: c.category, costPaise: c.options[0].costPaise }));

  if (minimumPossibleCostPaise > budgetPaise) {
    return {
      feasible: false,
      emptyCategories: [],
      minimumPossibleCostPaise,
      cheapestByCategory,
      bestValue: null,
      cheapest: null,
      alternative: null,
      omitted,
      search: { exhaustive: enumExhaustive, basketsEvaluated: 0, notes },
    };
  }

  let evaluated = 0;
  let truncated = false;
  const run = (objective, filter) => {
    const r = searchBest(perCategory, budgetPaise, objective, filter);
    evaluated += r.evaluated;
    truncated = truncated || r.truncated;
    return r.best;
  };

  const bestValue = run("score");
  let cheapest = run("cost");
  if (cheapest && cheapest.key === bestValue.key) {
    omitted.push({
      strategyKey: "CHEAPEST",
      reason: "The lowest-cost feasible basket is identical to the BEST_VALUE basket, so it is not repeated.",
    });
    cheapest = null;
  }

  // ALTERNATIVE: highest-scoring basket that changes at least min(2, #categories)
  // category selections vs BEST_VALUE, differs from CHEAPEST, and offers a real
  // trade-off: it is cheaper than BEST_VALUE or has more complete evidence.
  const minChanged = Math.min(2, perCategory.length);
  const cheapestKey = cheapest ? cheapest.key : null;
  const alternative = run("score", (b) => {
    if (b.key === bestValue.key || b.key === cheapestKey) return false;
    if (categoriesChanged(b, bestValue).length < minChanged) return false;
    return b.costPaise < bestValue.costPaise || b.evidence > bestValue.evidence + EPS;
  });
  if (!alternative) {
    omitted.push({
      strategyKey: "ALTERNATIVE",
      reason: `No other feasible basket changes at least ${minChanged} category selection(s) while being cheaper than BEST_VALUE or better evidenced (and different from CHEAPEST).`,
    });
  }

  if (truncated) notes.push(`Search stopped after ${MAX_BASKETS_EVALUATED} baskets; results are the best found, not guaranteed optimal.`);

  return {
    feasible: true,
    emptyCategories: [],
    minimumPossibleCostPaise,
    cheapestByCategory,
    bestValue,
    cheapest,
    alternative,
    omitted,
    search: { exhaustive: enumExhaustive && !truncated, basketsEvaluated: evaluated, notes },
  };
}

module.exports = {
  optimize,
  buildCategoryOptions,
  searchBest,
  categoriesChanged,
  EPS,
  OPTION_LIMIT_PER_CATEGORY,
  MAX_BASKETS_EVALUATED,
};
