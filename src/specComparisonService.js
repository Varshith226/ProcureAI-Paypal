// src/specComparisonService.js
// Deterministic specification comparison between Plan B (Recommended) and Plan A (Lowest Cost)
// strictly derived from verified catalog fields (zero LLM hallucinations).

const catalog = require("./catalog.json");

/**
 * Build a lookup map of catalog products by productId.
 */
function getCatalogMap(customCatalog = null) {
  const products = customCatalog?.products || catalog.products || [];
  const map = new Map();
  for (const p of products) {
    if (p.productId) map.set(p.productId, p);
    if (p.id) map.set(p.id, p);
  }
  return map;
}

/**
 * Format human-readable specs string from real catalog fields.
 */
function formatProductSpecDetail(product) {
  if (!product) return "";
  const specs = product.specs || {};
  const cat = (product.category || "").toLowerCase();

  if (cat === "monitor") {
    const parts = [];
    if (specs.sizeInches) parts.push(`${specs.sizeInches}-inch`);
    if (specs.refreshRateHz) parts.push(`${specs.refreshRateHz}Hz`);
    if (specs.panel) parts.push(specs.panel);
    if (specs.resolution) parts.push(specs.resolution);
    return parts.length ? parts.join(" ") : product.name;
  }

  if (cat === "keyboard") {
    if (specs.switchType) {
      const typeStr = specs.switchType.toLowerCase();
      if (typeStr === "mechanical") {
        return `mechanical switch${specs.switches ? ` (${specs.switches})` : ""}`;
      }
      const isMech = typeStr === "linear" || typeStr === "tactile" || typeStr === "clicky" || (product.name && product.name.toLowerCase().includes("mech"));
      const suffix = isMech ? " (mechanical)" : "";
      return `${specs.switchType} switch${suffix}${specs.switches ? ` - ${specs.switches}` : ""}`;
    }
    return product.name;
  }

  if (cat === "mouse") {
    const parts = [];
    if (specs.sensor) parts.push(specs.sensor);
    if (specs.dpi) parts.push(`${specs.dpi} DPI`);
    if (specs.wireless) parts.push("wireless");
    return parts.length ? parts.join(" ") : product.name;
  }

  if (cat === "headset" || cat === "headphones") {
    const parts = [];
    if (specs.anc) parts.push("active noise cancellation (ANC)");
    if (specs.wireless) parts.push("wireless");
    if (specs.driverMm) parts.push(`${specs.driverMm}mm drivers`);
    return parts.length ? parts.join(", ") : product.name;
  }

  if (cat === "laptop") {
    const parts = [];
    if (specs.cpu) parts.push(specs.cpu);
    if (specs.ramGB) parts.push(`${specs.ramGB}GB RAM`);
    if (specs.storageGB) parts.push(`${specs.storageGB}GB SSD`);
    return parts.length ? parts.join(", ") : product.name;
  }

  // Fallback: check if any specs object properties exist
  const entries = Object.entries(specs);
  if (entries.length > 0) {
    return entries.map(([k, v]) => `${k}: ${v}`).join(", ");
  }

  return product.name;
}

/**
 * Compare Plan B against Plan A deterministically.
 * @param {object} planA Lowest cost plan
 * @param {object} planB Recommended / Best Quality in Budget plan
 * @param {object} [catalogData] Optional custom catalog
 * @returns {object} { extraINR, differences: Array<{ category, label, fromName, toName }> }
 */
function computeWhatExtraBuys(planA, planB, catalogData = null) {
  if (!planA || !planB) {
    return { extraINR: 0, differences: [] };
  }

  const itemsA = planA.items || [];
  const itemsB = planB.items || [];
  const totalA = Number(planA.totalINR || planA.lockedTotalINR || 0);
  const totalB = Number(planB.totalINR || planB.lockedTotalINR || 0);
  const extraINR = Math.max(0, totalB - totalA);

  const catalogMap = getCatalogMap(catalogData);
  const differences = [];

  for (const itemB of itemsB) {
    const cat = (itemB.category || "").toLowerCase();
    const itemA = itemsA.find((it) => (it.category || "").toLowerCase() === cat);

    if (!itemA) continue;
    if (itemA.productId === itemB.productId) continue;

    const prodA = catalogMap.get(itemA.productId) || itemA;
    const prodB = catalogMap.get(itemB.productId) || itemB;

    const specA = formatProductSpecDetail(prodA);
    const specB = formatProductSpecDetail(prodB);

    let label = "";
    if (specA && specB && specA !== specB) {
      label = `${specB} instead of ${specA}`;
    } else {
      label = `${prodB.name} instead of ${prodA.name}`;
    }

    differences.push({
      category: itemB.category || cat,
      label,
      fromName: prodA.name || itemA.name,
      toName: prodB.name || itemB.name,
      priceDiffINR: (Number(itemB.unitPriceINR || 0) - Number(itemA.unitPriceINR || 0)),
    });
  }

  return {
    extraINR,
    differences,
    hasUpgrades: differences.length > 0 && extraINR > 0,
  };
}

module.exports = {
  computeWhatExtraBuys,
  formatProductSpecDetail,
};
