"use strict";

/**
 * Soft-preference scoring. Every component is on a 0–1 scale.
 *
 *   qualityScore      catalog qualityScore (0–1). Unknown -> 0 (no credit for missing data).
 *   reliabilityScore  catalog reliabilityScore (0–1). Unknown -> 0.
 *   deliveryScore     (D + 1 - d) / (D + 1), where d = deliveryDays, D = maxDeliveryDays.
 *                     d = 0 -> 1.0; d = D -> 1/(D+1); faster is always higher.
 *                     Only computed for products that already PASSED the hard
 *                     delivery check (d <= D), so a late product never scores.
 *
 *   unit composite = wQ * quality + wR * reliability + wD * delivery
 *
 * Basket composite score = mean over required categories of the
 * quantity-weighted mean unit composite inside that category. Each required
 * category counts equally, so buying 4 mice does not drown out the monitor.
 *
 * Price is deliberately NOT part of the score (no value-for-money weight has been
 * agreed in the shared contract). Price enters as the hard budget limit and as
 * the first tie-breaker (cheaper wins among equal scores).
 */

function deliveryScore(deliveryDays, maxDeliveryDays) {
  if (deliveryDays === null || deliveryDays > maxDeliveryDays) return null;
  return (maxDeliveryDays + 1 - deliveryDays) / (maxDeliveryDays + 1);
}

function unitScores(product, weights, maxDeliveryDays) {
  const quality = product.qualityScore ?? 0;
  const reliability = product.reliabilityScore ?? 0;
  const delivery = deliveryScore(product.deliveryDays, maxDeliveryDays) ?? 0;
  const composite = weights.quality * quality + weights.reliability * reliability + weights.delivery * delivery;
  return { quality, reliability, delivery, composite };
}

const round = (x, digits = 4) => Math.round(x * 10 ** digits) / 10 ** digits;

const SCORING_DESCRIPTION = Object.freeze({
  unitComposite: "weights.quality * qualityScore + weights.reliability * reliabilityScore + weights.delivery * deliveryScore",
  deliveryScore: "(maxDeliveryDays + 1 - deliveryDays) / (maxDeliveryDays + 1); only for products within the delivery limit",
  unknownSoftScores: "unknown qualityScore or reliabilityScore contributes 0",
  basketComposite: "mean over required categories of the quantity-weighted mean unit composite",
  priceRole: "hard budget limit and first tie-breaker; not part of the composite score",
});

module.exports = { deliveryScore, unitScores, round, SCORING_DESCRIPTION };
