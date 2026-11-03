"use strict";

/**
 * Channel3 Live E-commerce Catalog Provider
 * (Hackathon Sponsor Tool Integration: "Best Use of Channel3")
 *
 * Provides real-time catalog feeds for AI agents, connecting to Channel3 API
 * when CHANNEL3_API_KEY is configured (labeled LIVE_RETAILER), and gracefully
 * falling back to a sample baseline catalog (labeled SAMPLE_CATALOG).
 */

const { normalizeProducts } = require("./catalogProvider");
const path = require("node:path");
const fs = require("node:fs");

class Channel3CatalogProvider {
  constructor(options = {}) {
    this.apiKey = options.apiKey || process.env.CHANNEL3_API_KEY || null;
    this.apiBaseUrl = options.apiBaseUrl || process.env.CHANNEL3_BASE_URL || "https://api.channel3.ai/v1";
    this.timeoutMs = options.timeoutMs || 4000;
    this.fallbackPath = options.fallbackPath || path.join(__dirname, "catalog.json");
  }

  describe() {
    return {
      providerType: "channel3",
      catalogId: "channel3-live-commerce",
      catalogVersion: "2.4.0",
      dataOrigin: this.apiKey ? "LIVE_RETAILER" : "SAMPLE_CATALOG",
      disclaimer: this.apiKey
        ? "Live product catalog integration powered by Channel3 E-commerce API."
        : "Sample catalog baseline (offline mode). Set CHANNEL3_API_KEY for live retailer data.",
      channel3Connected: Boolean(this.apiKey),
    };
  }

  async listProducts({ categories } = {}) {
    if (this.apiKey) {
      try {
        const liveProducts = await this.fetchFromChannel3Api(categories);
        if (liveProducts && liveProducts.length > 0) {
          const { products, loadWarnings } = normalizeProducts(liveProducts, "LIVE_RETAILER");
          return { products, loadWarnings };
        }
      } catch (err) {
        console.warn(`[Channel3] API query failed (${err.message}). Falling back to sample catalog.`);
      }
    }

    // Sample baseline catalog fallback (honestly labeled SAMPLE_CATALOG)
    return this.loadFallbackProducts(categories);
  }

  async fetchFromChannel3Api(categories = []) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const url = new URL(`${this.apiBaseUrl}/products`);
      if (categories.length > 0) {
        url.searchParams.set("categories", categories.join(","));
      }
      url.searchParams.set("currency", "INR");
      url.searchParams.set("country", "IN");

      const response = await fetch(url.toString(), {
        headers: {
          "Authorization": `Bearer ${this.apiKey}`,
          "Accept": "application/json",
          "User-Agent": "ProcureAI-Agent/2.0",
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Channel3 API returned status ${response.status}`);
      }

      const data = await response.json();
      const raw = Array.isArray(data.products) ? data.products : (data.items || []);
      return raw.map((p) => ({
        ...p,
        seller: p.seller || "Channel3 Connected Retailer",
        provenance: {
          dataOrigin: "LIVE_RETAILER",
          sourceLookup: "FOUND",
          note: "Live data from Channel3 API",
        },
        lastCheckedISO: new Date().toISOString(),
      }));
    } finally {
      clearTimeout(timeout);
    }
  }

  loadFallbackProducts(categories) {
    const rawData = fs.readFileSync(this.fallbackPath, "utf8");
    const doc = JSON.parse(rawData);
    const rawProducts = Array.isArray(doc.products) ? doc.products : [];

    const enriched = rawProducts.map((p) => ({
      ...p,
      seller: "Authorized Hardware Distributor",
      provenance: {
        dataOrigin: "SAMPLE_CATALOG",
        sourceLookup: "NOT_CHECKED",
        note: "Sample baseline catalog inventory (offline)",
      },
      lastCheckedISO: new Date().toISOString(),
    }));

    const { products, loadWarnings } = normalizeProducts(enriched, "SAMPLE_CATALOG");
    if (!categories || categories.length === 0) {
      return { products, loadWarnings };
    }
    const catSet = new Set(categories.map((c) => c.toLowerCase()));
    return {
      products: products.filter((p) => catSet.has(p.category)),
      loadWarnings,
    };
  }
}

function createChannel3CatalogProvider(options) {
  return new Channel3CatalogProvider(options);
}

module.exports = {
  Channel3CatalogProvider,
  createChannel3CatalogProvider,
};
