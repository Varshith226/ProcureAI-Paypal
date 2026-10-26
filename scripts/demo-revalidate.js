"use strict";

/**
 * Demo of the pre-checkout safety check (no server, no files changed):
 *   1. build the ₹60,000 plan from the demo catalog
 *   2. simulate the retailer changing prices / stock AFTER the user approved
 *   3. revalidate the approved BEST_VALUE basket -> VALID, CHANGED, INVALID
 *
 *   npm run demo:revalidate
 */

const fs = require("node:fs");
const path = require("node:path");
const { buildPlanDetailed } = require("../src/planService");
const { revalidateStrategy } = require("../src/revalidator");
const { createStaticCatalogProvider } = require("../src/catalogProvider");

const root = path.join(__dirname, "..");
const catalogDoc = JSON.parse(fs.readFileSync(path.join(root, "src", "catalog.json"), "utf8"));
const request = JSON.parse(fs.readFileSync(path.join(root, "examples", "request-60k-setup.json"), "utf8"));
const meta = { ...catalogDoc, providerType: "demo-copy" };
const providerWith = (edit) => {
  const products = structuredClone(catalogDoc.products);
  edit(products);
  return createStaticCatalogProvider(products, meta);
};
const inr = (n) => (n === null ? "unknown" : `₹${Number(n).toLocaleString("en-IN")}`);

(async () => {
  const stored = await buildPlanDetailed(request, providerWith(() => {}));
  const bv = stored.plan.strategies.BEST_VALUE;
  console.log(`Approved ${bv.strategyName}: ${bv.items.map((i) => i.productId).join(", ")} = ${inr(bv.totalINR)}\n`);

  const monitorId = bv.items.find((i) => i.category === "monitor").productId;
  const mouseId = bv.items.find((i) => i.category === "mouse").productId;
  const scenarios = [
    ["Nothing changed", () => {}],
    [`Retailer raises ${monitorId} by ₹2,500`, (ps) => { ps.find((p) => p.productId === monitorId).unitPriceINR += 2500; }],
    [`Retailer raises ${monitorId} by ₹8,000`, (ps) => { ps.find((p) => p.productId === monitorId).unitPriceINR += 8000; }],
    [`${mouseId} sells out`, (ps) => { ps.find((p) => p.productId === mouseId).stockQuantity = 0; }],
  ];

  for (const [label, edit] of scenarios) {
    const r = await revalidateStrategy(stored, "BEST_VALUE", providerWith(edit));
    console.log(`▶ ${label}`);
    console.log(`  status ${r.status}  approved ${inr(r.approvedTotalINR)}  now ${inr(r.currentTotalINR)}  checkout allowed: ${r.canProceedToCheckout}`);
    console.log(`  ${r.summary}\n`);
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
