"use strict";

const { createStaticCatalogProvider } = require("../src/catalogProvider");

/** Compact fixture product. Defaults are deliberately boring so each test's numbers are obvious. */
function product(id, category, overrides = {}) {
  return {
    productId: id,
    name: `${id} test product`,
    category,
    brand: overrides.brand ?? "TestBrand",
    unitPriceINR: 1000,
    shippingINR: 0,
    stockQuantity: 10,
    deliveryDays: 2,
    warrantyMonths: 12,
    qualityScore: 0.5,
    reliabilityScore: 0.5,
    specs: category === "monitor" ? { refreshRateHz: 144 } : {},
    sourceUrl: null,
    lastCheckedISO: null,
    provenance: { dataOrigin: "SYNTHETIC_DEMO" },
    ...overrides,
  };
}

function request(overrides = {}) {
  return {
    requestId: "req_test",
    rawQuery: "test",
    budgetINR: 60000,
    maxDeliveryDays: 7,
    requiredCategories: [
      { category: "monitor", quantity: 1 },
      { category: "keyboard", quantity: 1 },
      { category: "mouse", quantity: 1 },
      { category: "headphones", quantity: 1 },
    ],
    hardConstraints: { monitor: { minRefreshRateHz: 144 } },
    weights: { quality: 0.45, reliability: 0.35, delivery: 0.2 },
    ...overrides,
  };
}

const provider = (products, meta) => createStaticCatalogProvider(products, meta);

/** Basic set: one valid product per category, ₹1,000 each. */
function basicCatalog(extra = []) {
  return [
    product("MON-A", "monitor"),
    product("KB-A", "keyboard"),
    product("MS-A", "mouse"),
    product("HP-A", "headphones"),
    ...extra,
  ];
}

const productIds = (strategy) => strategy.items.map((i) => `${i.productId}x${i.quantity}`).sort();

module.exports = { product, request, provider, basicCatalog, productIds };
