"use strict";

/**
 * Reproducible demo: runs the ₹60,000 setup request through the real pipeline
 * (catalog -> verification -> optimizer) without starting the server.
 *
 *   npm run demo                          # uses examples/request-60k-setup.json
 *   npm run demo -- path/to/request.json  # any other request
 *   npm run demo -- --write               # also saves examples/response-60k-setup.json
 */

const fs = require("node:fs");
const path = require("node:path");
const { buildPlan } = require("../src/planService");
const { createJsonFileCatalogProvider } = require("../src/catalogProvider");

const args = process.argv.slice(2);
const write = args.includes("--write");
const requestPath = args.find((a) => !a.startsWith("--")) || path.join(__dirname, "..", "examples", "request-60k-setup.json");

const inr = (n) => `₹${Number(n).toLocaleString("en-IN")}`;

(async () => {
  const request = JSON.parse(fs.readFileSync(requestPath, "utf8"));
  const plan = await buildPlan(request, createJsonFileCatalogProvider());

  console.log(`\nRequest  ${plan.requestId}: budget ${inr(plan.budgetINR)}, delivery ≤ ${request.maxDeliveryDays} days`);
  console.log(`Catalog  ${plan.catalog.catalogId} v${plan.catalog.catalogVersion} (${plan.catalog.dataOrigin})`);
  console.log(`Plan     ${plan.planId} — status ${plan.status}\n`);

  if (plan.status === "INFEASIBLE") {
    plan.infeasibility.reasons.forEach((r) => console.log(`  ✗ ${r}`));
    plan.infeasibility.suggestions.forEach((s) => console.log(`  → ${s}`));
  }

  for (const s of Object.values(plan.strategies)) {
    console.log(`${s.strategyName}  total ${inr(s.totalINR)}  leftover ${inr(s.leftoverBudgetINR)}  score ${s.compositeScore}`);
    console.table(
      s.items.map((i) => ({
        category: i.category,
        product: `${i.productId} ${i.name}`,
        qty: i.quantity,
        unit: inr(i.unitPriceINR),
        shipping: inr(i.shippingINR),
        line: inr(i.lineTotalINR),
        days: i.deliveryDays,
        evidence: i.verification.status,
      }))
    );
    console.log(`  checks: ${Object.entries(s.constraintSummary).map(([k, v]) => `${k}=${v}`).join(", ")}`);
    if (s.tradeOff) console.log(`  trade-off: ${s.tradeOff.summary}`);
    s.warnings.forEach((w) => console.log(`  ⚠ ${w}`));
    console.log();
  }
  plan.omittedStrategies.forEach((o) => console.log(`(${o.strategyKey} omitted: ${o.reason})`));

  console.log(`\nRejected products (${plan.rejectedProducts.length}):`);
  plan.rejectedProducts.forEach((r) => console.log(`  ✗ ${r.productId} ${r.name} — ${r.rejectedReason}`));
  plan.warnings.forEach((w) => console.log(`\n⚠ ${w}`));

  if (write) {
    const out = path.join(__dirname, "..", "examples", "response-60k-setup.json");
    fs.writeFileSync(out, JSON.stringify(plan, null, 2) + "\n");
    console.log(`\nSaved full response to ${path.relative(process.cwd(), out)}`);
  }
})().catch((e) => {
  console.error(e.errors ? JSON.stringify(e.errors, null, 2) : e);
  process.exit(1);
});
