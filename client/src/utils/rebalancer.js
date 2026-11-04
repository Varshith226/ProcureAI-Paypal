// client/src/utils/rebalancer.js

/**
 * Priority weighting for workstation peripherals:
 * Higher number = higher priority.
 * Lowest priority items (e.g. headphones, mouse) are downgraded first when seeking budget savings.
 */
export const CATEGORY_PRIORITY = {
  headphones: 1, // lowest priority peripheral
  mouse: 2,
  keyboard: 3,
  monitor: 4,    // high priority display (must respect refresh rate)
  laptop: 5,     // core compute unit
};

/**
 * Deterministically rebalances an over-budget customized basket to fit within budgetCap.
 * 
 * Rules:
 * 1. Pass 1: Reduce inflated quantities (> 1) back towards 1 (lowest priority categories first).
 * 2. Pass 2: Downgrade lowest priority components first using valid catalog alternatives.
 *    - Preserves hard constraints (e.g. refreshRateHz >= minRefreshRateHz, delivery <= maxDeliveryDays, in-stock > 0).
 * 3. Pass 3: Reset any manually inflated unit prices that exceed catalog prices.
 * 
 * @param {Object} params
 * @param {Array} params.items - Current basket items
 * @param {number} params.budgetCap - Authorized spending envelope
 * @param {number} params.minRefreshRateHz - Hard constraint for monitors
 * @param {number} params.maxDeliveryDays - Hard constraint for delivery SLA
 * @param {Array} params.catalogProducts - Available catalog products
 * @returns {Object} Rebalance result with full transparency diff
 */
export function rebalanceBasket({
  items = [],
  budgetCap = 60000,
  minRefreshRateHz = 144,
  maxDeliveryDays = 7,
  catalogProducts = [],
}) {
  let currentItems = items.map((i) => ({ ...i }));
  const changes = [];

  const calcTotal = (list) =>
    list.reduce(
      (sum, it) =>
        sum +
        (Number(it.unitPriceINR) || 0) * (it.quantity || 1) +
        (Number(it.shippingINR) || 0) * (it.quantity || 1),
      0
    );

  let currentTotal = calcTotal(currentItems);
  const initialTotal = currentTotal;

  if (currentTotal <= budgetCap) {
    return {
      success: true,
      needed: false,
      rebalancedItems: currentItems,
      subtotalINR: currentItems.reduce((s, i) => s + (Number(i.unitPriceINR) || 0) * (i.quantity || 1), 0),
      shippingTotalINR: currentItems.reduce((s, i) => s + (Number(i.shippingINR) || 0) * (i.quantity || 1), 0),
      totalINR: currentTotal,
      headroomINR: budgetCap - currentTotal,
      totalSavedINR: 0,
      changes: [],
    };
  }

  // Pass 1: Reduce inflated quantities (> 1) starting from lowest priority
  const sortedByPriorityAsc = [...currentItems].sort((a, b) => {
    const pA = CATEGORY_PRIORITY[a.category?.toLowerCase()] || 99;
    const pB = CATEGORY_PRIORITY[b.category?.toLowerCase()] || 99;
    return pA - pB;
  });

  for (const it of sortedByPriorityAsc) {
    if (currentTotal <= budgetCap) break;
    if ((it.quantity || 1) > 1) {
      const idx = currentItems.findIndex(
        (x) => (x.productId && x.productId === it.productId) || x.name === it.name
      );
      if (idx !== -1) {
        const oldQty = currentItems[idx].quantity;
        const newQty = 1;
        const unit = Number(currentItems[idx].unitPriceINR) || 0;
        const ship = Number(currentItems[idx].shippingINR) || 0;
        const lineBefore = (unit + ship) * oldQty;
        const lineAfter = (unit + ship) * newQty;
        const saved = lineBefore - lineAfter;

        if (saved > 0) {
          changes.push({
            category: currentItems[idx].category,
            type: "QUANTITY",
            from: {
              name: currentItems[idx].name,
              unitPriceINR: unit,
              quantity: oldQty,
              lineTotalINR: lineBefore,
            },
            to: {
              name: currentItems[idx].name,
              unitPriceINR: unit,
              quantity: newQty,
              lineTotalINR: lineAfter,
            },
            savedINR: saved,
            detail: `Reduced ${currentItems[idx].category} quantity from ${oldQty} to ${newQty}`,
          });

          currentItems[idx] = { ...currentItems[idx], quantity: newQty };
          currentTotal = calcTotal(currentItems);
        }
      }
    }
  }

  // Pass 2: Downgrade lowest priority components first (headphones -> mouse -> keyboard -> monitor)
  if (currentTotal > budgetCap) {
    const itemsToDowngrade = [...currentItems].sort((a, b) => {
      const pA = CATEGORY_PRIORITY[a.category?.toLowerCase()] || 99;
      const pB = CATEGORY_PRIORITY[b.category?.toLowerCase()] || 99;
      return pA - pB;
    });

    for (const it of itemsToDowngrade) {
      if (currentTotal <= budgetCap) break;
      const cat = it.category?.toLowerCase();
      const currentUnit = Number(it.unitPriceINR) || 0;

      // Find candidates in same category that are strictly cheaper
      const candidates = catalogProducts.filter((p) => {
        if (p.category?.toLowerCase() !== cat) return false;
        if (p.productId === it.productId) return false;
        if ((Number(p.unitPriceINR) || 0) >= currentUnit) return false;
        if ((Number(p.deliveryDays) || 0) > maxDeliveryDays) return false;
        if (p.stockQuantity !== null && p.stockQuantity !== undefined && p.stockQuantity <= 0) return false;
        if (cat === "monitor" && minRefreshRateHz) {
          const hz = p.specs?.refreshRateHz;
          if (!hz || hz < minRefreshRateHz) return false;
        }
        return true;
      });

      if (candidates.length > 0) {
        // Sort candidates by unitPriceINR ascending
        candidates.sort((a, b) => (Number(a.unitPriceINR) || 0) - (Number(b.unitPriceINR) || 0));

        // Find candidate that brings basket under budget or max savings
        let chosenCandidate = candidates[0];
        for (const cand of candidates) {
          const testSaved = (currentUnit - cand.unitPriceINR) * (it.quantity || 1);
          if (currentTotal - testSaved <= budgetCap) {
            chosenCandidate = cand;
            break;
          }
        }

        const idx = currentItems.findIndex(
          (x) => (x.productId && x.productId === it.productId) || x.name === it.name
        );
        if (idx !== -1) {
          const oldItem = currentItems[idx];
          const qty = oldItem.quantity || 1;
          const oldLineTotal = (Number(oldItem.unitPriceINR) + (Number(oldItem.shippingINR) || 0)) * qty;
          const newLineTotal = (Number(chosenCandidate.unitPriceINR) + (Number(chosenCandidate.shippingINR) || 0)) * qty;
          const saved = oldLineTotal - newLineTotal;

          if (saved > 0) {
            changes.push({
              category: oldItem.category,
              type: "DOWNGRADE",
              from: {
                name: oldItem.name,
                unitPriceINR: Number(oldItem.unitPriceINR),
                quantity: qty,
                lineTotalINR: oldLineTotal,
              },
              to: {
                name: chosenCandidate.name,
                unitPriceINR: Number(chosenCandidate.unitPriceINR),
                quantity: qty,
                lineTotalINR: newLineTotal,
              },
              savedINR: saved,
              detail: `Downgraded ${oldItem.category} from ${oldItem.name} (₹${Number(oldItem.unitPriceINR).toLocaleString("en-IN")}) to ${chosenCandidate.name} (₹${Number(chosenCandidate.unitPriceINR).toLocaleString("en-IN")})`,
            });

            currentItems[idx] = {
              ...oldItem,
              productId: chosenCandidate.productId,
              name: chosenCandidate.name,
              brand: chosenCandidate.brand,
              unitPriceINR: chosenCandidate.unitPriceINR,
              shippingINR: chosenCandidate.shippingINR || 0,
              specs: chosenCandidate.specsSummary || chosenCandidate.specs || oldItem.specs,
            };
            currentTotal = calcTotal(currentItems);
          }
        }
      }
    }
  }

  // Pass 3: Custom manually inflated price reset (if user entered an exorbitantly high custom price)
  if (currentTotal > budgetCap) {
    for (let i = 0; i < currentItems.length; i++) {
      if (currentTotal <= budgetCap) break;
      const it = currentItems[i];
      const catalogMatch = catalogProducts.find((p) => p.productId === it.productId);
      if (catalogMatch && it.unitPriceINR > catalogMatch.unitPriceINR) {
        const saved = (it.unitPriceINR - catalogMatch.unitPriceINR) * (it.quantity || 1);
        changes.push({
          category: it.category,
          type: "PRICE_RESET",
          from: {
            name: it.name,
            unitPriceINR: it.unitPriceINR,
            quantity: it.quantity,
            lineTotalINR: it.unitPriceINR * (it.quantity || 1),
          },
          to: {
            name: it.name,
            unitPriceINR: catalogMatch.unitPriceINR,
            quantity: it.quantity,
            lineTotalINR: catalogMatch.unitPriceINR * (it.quantity || 1),
          },
          savedINR: saved,
          detail: `Reset manual price on ${it.name} from ₹${it.unitPriceINR.toLocaleString("en-IN")} to verified catalog price ₹${catalogMatch.unitPriceINR.toLocaleString("en-IN")}`,
        });
        currentItems[i].unitPriceINR = catalogMatch.unitPriceINR;
        currentTotal = calcTotal(currentItems);
      }
    }
  }

  const finalSubtotal = currentItems.reduce(
    (s, i) => s + (Number(i.unitPriceINR) || 0) * (i.quantity || 1),
    0
  );
  const finalShipping = currentItems.reduce(
    (s, i) => s + (Number(i.shippingINR) || 0) * (i.quantity || 1),
    0
  );

  return {
    success: currentTotal <= budgetCap,
    needed: true,
    rebalancedItems: currentItems,
    subtotalINR: finalSubtotal,
    shippingTotalINR: finalShipping,
    totalINR: currentTotal,
    headroomINR: budgetCap - currentTotal,
    totalSavedINR: initialTotal - currentTotal,
    changes,
  };
}
