"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const { isValidRupeeAmount } = require("./money");

/**
 * Catalog providers.
 *
 * Every provider implements the same small async interface so the optimizer
 * never needs to know where products come from:
 *
 *   provider.describe()                 -> { catalogId, catalogVersion, dataOrigin, disclaimer, providerType }
 *   provider.listProducts({ categories }) -> { products: Product[], loadWarnings: string[] }
 *
 * To plug in a live source later (retailer API, MCP product tool, ...), write
 * a provider with this interface and pass it to createProcurementRouter().
 * A live provider should set dataOrigin "SOURCE_VERIFIED" (or
 * "CATALOG_UNCHECKED" when it only has cached data), fill sourceUrl and
 * lastCheckedISO with real values, and set provenance.sourceLookup.
 */

const DATA_ORIGINS = ["SYNTHETIC_DEMO", "CATALOG_UNCHECKED", "SOURCE_VERIFIED"];
const SOURCE_LOOKUP = ["NOT_CHECKED", "FOUND", "NOT_FOUND", "UNAVAILABLE"];

class CatalogUnavailableError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = "CatalogUnavailableError";
    this.cause = cause;
  }
}

const isPlainObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const nullableNumber = (v, check) => v === null || v === undefined || (typeof v === "number" && check(v));
const isScore = (v) => Number.isFinite(v) && v >= 0 && v <= 1;
const isNonNegInt = (v) => Number.isInteger(v) && v >= 0;

/**
 * Validates and normalizes one raw catalog record.
 * Unknown facts are kept as null — never defaulted to a "good" value.
 * Returns { product } or { error }.
 */
function normalizeProduct(raw, defaultOrigin) {
  if (!isPlainObject(raw)) return { error: "record is not an object" };
  const id = raw.productId;
  const fail = (msg) => ({ error: `${typeof id === "string" ? id : "(no productId)"}: ${msg}` });

  if (typeof id !== "string" || id.trim() === "") return fail("productId must be a non-empty string");
  if (typeof raw.name !== "string" || raw.name.trim() === "") return fail("name must be a non-empty string");
  if (typeof raw.category !== "string" || raw.category.trim() === "") return fail("category must be a non-empty string");
  if (raw.brand !== undefined && raw.brand !== null && typeof raw.brand !== "string") return fail("brand must be a string or null");

  // Money: null = unknown; otherwise a valid rupee amount.
  for (const f of ["unitPriceINR", "shippingINR"]) {
    if (!(raw[f] === null || raw[f] === undefined || isValidRupeeAmount(raw[f]))) {
      return fail(`${f} must be null or a non-negative rupee amount with at most 2 decimals`);
    }
  }
  if (!nullableNumber(raw.stockQuantity, isNonNegInt)) return fail("stockQuantity must be null or a non-negative integer");
  if (!nullableNumber(raw.deliveryDays, isNonNegInt)) return fail("deliveryDays must be null or a non-negative integer");
  if (!nullableNumber(raw.warrantyMonths, isNonNegInt)) return fail("warrantyMonths must be null or a non-negative integer");
  if (!nullableNumber(raw.qualityScore, isScore)) return fail("qualityScore must be null or a number in [0, 1]");
  if (!nullableNumber(raw.reliabilityScore, isScore)) return fail("reliabilityScore must be null or a number in [0, 1]");
  if (raw.specs !== undefined && raw.specs !== null && !isPlainObject(raw.specs)) return fail("specs must be an object");

  // Evidence fields: a sourceUrl must be a real http(s) URL and never a placeholder domain.
  let sourceUrl = raw.sourceUrl ?? null;
  if (sourceUrl !== null) {
    let parsed;
    try {
      parsed = new URL(sourceUrl);
    } catch {
      return fail("sourceUrl must be a valid URL or null");
    }
    if (!/^https?:$/.test(parsed.protocol)) return fail("sourceUrl must be http(s)");
    if (/(^|\.)example\.(com|org|net)$/i.test(parsed.hostname)) {
      return fail("sourceUrl uses a placeholder example.* domain and cannot count as evidence");
    }
  }
  let lastCheckedISO = raw.lastCheckedISO ?? null;
  if (lastCheckedISO !== null && (typeof lastCheckedISO !== "string" || Number.isNaN(Date.parse(lastCheckedISO)))) {
    return fail("lastCheckedISO must be an ISO-8601 timestamp or null");
  }

  const provenance = isPlainObject(raw.provenance) ? raw.provenance : {};
  const dataOrigin = provenance.dataOrigin ?? defaultOrigin;
  if (!DATA_ORIGINS.includes(dataOrigin)) return fail(`provenance.dataOrigin must be one of ${DATA_ORIGINS.join(", ")}`);
  const sourceLookup = provenance.sourceLookup ?? "NOT_CHECKED";
  if (!SOURCE_LOOKUP.includes(sourceLookup)) return fail(`provenance.sourceLookup must be one of ${SOURCE_LOOKUP.join(", ")}`);

  return {
    product: {
      productId: id.trim(),
      name: raw.name.trim(),
      category: raw.category.trim().toLowerCase(),
      brand: raw.brand ?? null,
      seller: raw.seller ?? null,
      unitPriceINR: raw.unitPriceINR ?? null,
      shippingINR: raw.shippingINR ?? null,
      stockQuantity: raw.stockQuantity ?? null,
      deliveryDays: raw.deliveryDays ?? null,
      warrantyMonths: raw.warrantyMonths ?? null,
      specs: raw.specs ?? {},
      qualityScore: raw.qualityScore ?? null,
      reliabilityScore: raw.reliabilityScore ?? null,
      sourceUrl,
      lastCheckedISO,
      provenance: { dataOrigin, sourceLookup, note: typeof provenance.note === "string" ? provenance.note : null },
    },
  };
}

/** Validates a whole list; invalid records are skipped with a warning, duplicate IDs keep the first. */
function normalizeProducts(rawProducts, defaultOrigin) {
  const products = [];
  const loadWarnings = [];
  const seen = new Set();
  for (const raw of rawProducts) {
    const { product, error } = normalizeProduct(raw, defaultOrigin);
    if (error) {
      loadWarnings.push(`Skipped invalid catalog record — ${error}`);
      continue;
    }
    if (seen.has(product.productId)) {
      loadWarnings.push(`Skipped duplicate catalog record ${product.productId}`);
      continue;
    }
    seen.add(product.productId);
    products.push(product);
  }
  products.sort((a, b) => (a.productId < b.productId ? -1 : a.productId > b.productId ? 1 : 0));
  return { products, loadWarnings };
}

function filterByCategories(products, categories) {
  if (!categories) return products;
  const wanted = new Set(categories);
  return products.filter((p) => wanted.has(p.category));
}

/** In-memory provider — used by tests and as a building block for other providers. */
function createStaticCatalogProvider(rawProducts, meta = {}) {
  const dataOrigin = meta.dataOrigin || "SYNTHETIC_DEMO";
  const { products, loadWarnings } = normalizeProducts(rawProducts, dataOrigin);
  const description = {
    providerType: meta.providerType || "static",
    catalogId: meta.catalogId || "static-catalog",
    catalogVersion: meta.catalogVersion || "0",
    dataOrigin,
    disclaimer: meta.disclaimer || null,
  };
  return {
    describe: () => ({ ...description }),
    async listProducts({ categories } = {}) {
      return { products: filterByCategories(products, categories), loadWarnings: [...loadWarnings] };
    },
  };
}

/** Provider backed by a JSON file such as src/catalog.json. Re-reads the file only when it changes. */
function createJsonFileCatalogProvider(filePath = path.join(__dirname, "catalog.json")) {
  let cache = null; // { mtimeMs, inner }
  async function load() {
    let stat;
    try {
      stat = await fs.stat(filePath);
    } catch (e) {
      throw new CatalogUnavailableError(`Catalog file not found: ${path.basename(filePath)}`, e);
    }
    if (cache && cache.mtimeMs === stat.mtimeMs) return cache.inner;
    let doc;
    try {
      doc = JSON.parse(await fs.readFile(filePath, "utf8"));
    } catch (e) {
      throw new CatalogUnavailableError(`Catalog file is not valid JSON: ${path.basename(filePath)}`, e);
    }
    if (!isPlainObject(doc) || !Array.isArray(doc.products)) {
      throw new CatalogUnavailableError("Catalog file must be an object with a 'products' array");
    }
    const inner = createStaticCatalogProvider(doc.products, {
      providerType: "json-file",
      catalogId: doc.catalogId,
      catalogVersion: doc.catalogVersion,
      dataOrigin: doc.dataOrigin,
      disclaimer: doc.disclaimer,
    });
    cache = { mtimeMs: stat.mtimeMs, inner };
    return inner;
  }
  return {
    describe: () => (cache ? cache.inner.describe() : { providerType: "json-file", catalogId: null }),
    async listProducts(opts) {
      return (await load()).listProducts(opts);
    },
    async describeLoaded() {
      return (await load()).describe();
    },
  };
}

module.exports = {
  DATA_ORIGINS,
  SOURCE_LOOKUP,
  CatalogUnavailableError,
  normalizeProduct,
  normalizeProducts,
  createStaticCatalogProvider,
  createJsonFileCatalogProvider,
};
