"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createChannel3CatalogProvider } = require("../src/channel3Provider");

test("Phase 4: Channel3 catalog provider interface and fallback compliance", async () => {
  const provider = createChannel3CatalogProvider();

  // 1. Description conforms to provider specification
  const desc = provider.describe();
  assert.equal(desc.providerType, "channel3");
  assert.ok(desc.catalogId.includes("channel3"));
  assert.equal(desc.channel3Connected, false);

  // 2. Returns products with SAMPLE_CATALOG data origin in fallback mode
  const { products, loadWarnings } = await provider.listProducts();
  assert.ok(Array.isArray(products));
  assert.ok(products.length > 0);
  assert.ok(Array.isArray(loadWarnings));

  const first = products[0];
  assert.ok(first.productId);
  assert.ok(first.unitPriceINR > 0);
  assert.equal(first.provenance.dataOrigin, "SAMPLE_CATALOG");
  assert.equal(first.provenance.sourceLookup, "NOT_CHECKED");

  // 3. Category filtering
  const monitorProducts = await provider.listProducts({ categories: ["monitor"] });
  assert.ok(monitorProducts.products.length > 0);
  for (const p of monitorProducts.products) {
    assert.equal(p.category, "monitor");
  }

  // 4. Graceful handling of configured API key with network timeout / error
  const mockApiProvider = createChannel3CatalogProvider({
    apiKey: "test_ch3_key_live",
    apiBaseUrl: "http://127.0.0.1:54321", // non-existent local port
    timeoutMs: 100,
  });

  const apiDesc = mockApiProvider.describe();
  assert.equal(apiDesc.channel3Connected, true);
  assert.equal(apiDesc.dataOrigin, "LIVE_RETAILER");

  // Should gracefully fall back rather than throwing
  const fallbackResult = await mockApiProvider.listProducts({ categories: ["keyboard"] });
  assert.ok(fallbackResult.products.length > 0);
  for (const p of fallbackResult.products) {
    assert.equal(p.category, "keyboard");
  }
});

