// test/specComparison.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const { computeWhatExtraBuys, formatProductSpecDetail } = require("../src/specComparisonService.js");

test("specComparison: formatProductSpecDetail extracts real specs without hallucination", () => {
  const monitor = {
    productId: "MON-002",
    name: "Veltrix Pulse 27Q 170Hz IPS",
    category: "monitor",
    specs: { sizeInches: 27, refreshRateHz: 170, panel: "IPS", resolution: "1440p" },
  };
  const formatted = formatProductSpecDetail(monitor);
  assert.equal(formatted, "27-inch 170Hz IPS 1440p");

  const kb = {
    productId: "KB-001",
    name: "ForgeType Pro Mechanical",
    category: "keyboard",
    specs: { switchType: "mechanical", switches: "Cherry MX Brown" },
  };
  assert.equal(formatProductSpecDetail(kb), "mechanical switch (Cherry MX Brown)");
});

test("specComparison: computeWhatExtraBuys computes deterministic spec differences between Plan B and Plan A", () => {
  const planA = {
    totalINR: 15000,
    items: [
      {
        productId: "MON-001",
        category: "monitor",
        name: "Lumora View 24F 165Hz IPS",
        unitPriceINR: 11499,
        specs: { sizeInches: 24, refreshRateHz: 165, panel: "IPS", resolution: "1080p" },
      },
      {
        productId: "KB-002",
        category: "keyboard",
        name: "KeyPulse Membrane",
        unitPriceINR: 1299,
        specs: { switchType: "membrane" },
      },
    ],
  };

  const planB = {
    totalINR: 26498,
    items: [
      {
        productId: "MON-002",
        category: "monitor",
        name: "Veltrix Pulse 27Q 170Hz IPS",
        unitPriceINR: 21999,
        specs: { sizeInches: 27, refreshRateHz: 170, panel: "IPS", resolution: "1440p" },
      },
      {
        productId: "KB-001",
        category: "keyboard",
        name: "ForgeType Pro Mechanical",
        unitPriceINR: 4499,
        specs: { switchType: "mechanical", switches: "Cherry MX Brown" },
      },
    ],
  };

  const result = computeWhatExtraBuys(planA, planB);
  assert.equal(result.extraINR, 11498);
  assert.equal(result.hasUpgrades, true);
  assert.equal(result.differences.length, 2);

  const monitorDiff = result.differences.find((d) => d.category === "monitor");
  assert.ok(monitorDiff);
  assert.match(monitorDiff.label, /27-inch 170Hz IPS 1440p instead of 24-inch 165Hz IPS 1080p/);

  const kbDiff = result.differences.find((d) => d.category === "keyboard");
  assert.ok(kbDiff);
  assert.match(kbDiff.label, /mechanical/);
});

test("specComparison: returns zero differences when plans are identical", () => {
  const plan = {
    totalINR: 20000,
    items: [{ productId: "MON-001", category: "monitor", unitPriceINR: 11499 }],
  };
  const result = computeWhatExtraBuys(plan, plan);
  assert.equal(result.extraINR, 0);
  assert.equal(result.differences.length, 0);
  assert.equal(result.hasUpgrades, false);
});
