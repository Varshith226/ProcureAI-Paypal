"use strict";

const crypto = require("node:crypto");
const { getDb, appendAuditLog } = require("./db");

const DEFAULT_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

/**
 * Deterministic Vendor floor policy:
 * - Vendor has base margin of 12-15%
 * - Max allowable discount is bounded by minimum floor margin
 * - Volume rule:
 *    * 4 or 5+ laptops unlock OEM Bulk Fleet discount (8.0% - 9.5%)
 *    * Bundle items >= 4 or order total >= ₹35,000 unlocks Multi-Line tier (5.5%)
 *    * Standard tier (3.0%)
 * - No discount can ever be approved below the vendor's hard cost floor!
 */
function calculateVendorFloor(totalINR, itemCount, items = []) {
  const laptopCount = items
    .filter((i) => /laptop/i.test(i.category || i.name))
    .reduce((sum, i) => sum + (Number(i.quantity) || 1), 0);

  let tierName = "Standard B2B Tier";
  let maxDiscountPct = 3.0;

  if (laptopCount >= 4) {
    maxDiscountPct = laptopCount >= 5 ? 9.5 : 8.0;
    tierName = `OEM Fleet Volume Tier (${laptopCount} Laptops)`;
  } else if (itemCount >= 4 || totalINR >= 35000) {
    maxDiscountPct = 5.5;
    tierName = `Multi-Line Bundle Tier (${itemCount} items)`;
  }

  const maxDiscountINR = Math.round(totalINR * (maxDiscountPct / 100));
  const floorPriceINR = totalINR - maxDiscountINR;

  return {
    floorPriceINR,
    maxDiscountINR,
    maxDiscountPct,
    tierName,
    laptopCount,
    isBulk: itemCount >= 3 || totalINR >= 35000 || laptopCount >= 4,
  };
}

/**
 * Generate context-aware hardware upgrade suggestions based on current basket components.
 */
function generateUpgradeSuggestions(items = [], totalINR = 0) {
  const suggestions = [];
  const laptopItem = items.find((i) => /laptop/i.test(i.category || i.name));
  const monitorItem = items.find((i) => /monitor/i.test(i.category || i.name));
  const keyboardItem = items.find((i) => /keyboard/i.test(i.category || i.name));

  if (laptopItem) {
    const qty = Number(laptopItem.quantity) || 1;
    suggestions.push({
      id: "upg_laptop_ram",
      category: "laptop",
      title: qty >= 4 ? `Fleet RAM Upgrade: 32 GB Enterprise (${qty} units)` : "Upgrade to 32 GB Multitasking RAM",
      description: "Upgrade system RAM from 16 GB to 32 GB DDR5 for heavy compiling, Docker containers & local LLMs.",
      priceDeltaINR: Math.round(4500 * qty),
      badge: "High Performance",
      inStock: true,
    });
    suggestions.push({
      id: "upg_laptop_warranty",
      category: "warranty",
      title: `3-Year Commercial On-Site SLA Care Pack (${qty} units)`,
      description: "Next-business-day on-site repairs with accidental damage protection directly from certified OEM technicians.",
      priceDeltaINR: Math.round(2800 * qty),
      badge: "Enterprise SLA",
      inStock: true,
    });
  }

  if (monitorItem) {
    suggestions.push({
      id: "upg_monitor_qhd",
      category: "monitor",
      title: "Upgrade to Veltrix Pulse 27\" QHD 170Hz IPS",
      description: "Upgrade from 1080p to 1440p 2K resolution with 170Hz refresh rate and wide color gamut.",
      priceDeltaINR: 8500,
      badge: "Visuals+",
      inStock: true,
    });
  }

  if (keyboardItem) {
    suggestions.push({
      id: "upg_peripherals_hot_swap",
      category: "keyboard",
      title: "Tactis Quill 75 Wireless Mechanical Keyboard",
      description: "Hot-swappable tactile switches with acoustic foam dampening and low-latency 2.4GHz wireless.",
      priceDeltaINR: 2200,
      badge: "Ergonomics",
      inStock: true,
    });
  }

  suggestions.push({
    id: "upg_express_logistics",
    category: "logistics",
    title: "Expedited Express 48-Hour Air Courier",
    description: "Priority air transit with temperature-controlled handling and guaranteed 2-day delivery SLA.",
    priceDeltaINR: 950,
    badge: "Fast Delivery",
    inStock: true,
  });

  return suggestions;
}

/**
 * Execute a realistic multi-round LLM or rule-driven negotiation.
 */
async function negotiateVendorDiscount({
  planId,
  items = [],
  currentTotalINR,
  targetDiscountINR = null,
  maxRounds = 3,
}) {
  const total = Number(currentTotalINR);
  const count = items.reduce((sum, it) => sum + (Number(it.quantity) || 1), 0);
  const { floorPriceINR, maxDiscountINR, maxDiscountPct, tierName, laptopCount } = calculateVendorFloor(total, count, items);

  const targetDiscount = targetDiscountINR
    ? Math.min(Number(targetDiscountINR), Math.round(total * 0.12))
    : Math.round(total * (maxDiscountPct / 100));

  const apiKey = process.env.GEMINI_API_KEY;
  const isGeminiAvailable = Boolean(apiKey && apiKey !== "your-gemini-api-key");

  let rounds = [];
  let finalDiscountINR = 0;
  let accepted = false;
  let mode = "OFFLINE_SIMULATION";

  if (isGeminiAvailable) {
    try {
      const llmResult = await runGeminiNegotiation({
        items,
        total,
        targetDiscount,
        maxDiscountINR,
        maxRounds,
        apiKey,
      });
      rounds = llmResult.rounds;
      finalDiscountINR = Math.min(llmResult.finalDiscountINR, maxDiscountINR);
      accepted = llmResult.accepted;
      mode = "GEMINI_LLM";
    } catch (err) {
      console.warn("Gemini negotiation error, falling back to deterministic simulation:", err.message);
      // Fall through to deterministic simulation
    }
  }

  // Fallback to deterministic rules if Gemini unavailable or failed
  if (rounds.length === 0) {
    mode = "OFFLINE_SIMULATION";
    const round1Buyer = Math.round(maxDiscountINR * 1.15);
    const round1Vendor = Math.round(maxDiscountINR * 0.5);

    const buyerMsg1 = laptopCount >= 4
      ? `ProcureAI Buyer Agent: We are executing a corporate fleet procurement of ${laptopCount} enterprise laptops (${tierName}, order total ₹${total.toLocaleString("en-IN")}) with an immediate PayPal Pay-on-Delivery Authorization Hold. We request an institutional volume discount of ₹${round1Buyer.toLocaleString("en-IN")} (${((round1Buyer / total) * 100).toFixed(1)}%).`
      : `ProcureAI Buyer Agent: We are executing an authorized purchase of ${count} items (${tierName}, ₹${total.toLocaleString("en-IN")}) with an immediate PayPal Pay-on-Delivery Authorization Hold. We request a ₹${round1Buyer.toLocaleString("en-IN")} (${((round1Buyer / total) * 100).toFixed(1)}%) volume concession.`;

    const vendorMsg1 = laptopCount >= 4
      ? `Merchant Quote Engine: Fleet tier acknowledged. For ${laptopCount} laptops, our direct distributor allocation enables an initial volume concession of ₹${round1Vendor.toLocaleString("en-IN")} (${((round1Vendor / total) * 100).toFixed(1)}%) with unified warranty provisioning.`
      : `Merchant Quote Engine: Standard distributor margin restricts unbundled discounts. Given the ${count}-unit bundle, we can offer an initial commercial concession of ₹${round1Vendor.toLocaleString("en-IN")} (${((round1Vendor / total) * 100).toFixed(1)}%).`;

    rounds.push({
      round: 1,
      buyerOfferINR: total - round1Buyer,
      buyerDiscountINR: round1Buyer,
      buyerMessage: buyerMsg1,
      vendorCounterINR: total - round1Vendor,
      vendorDiscountINR: round1Vendor,
      vendorMessage: vendorMsg1,
      buyerOfferUsd: ((total - round1Buyer) * 0.0119).toFixed(2),
      vendorCounterUsd: ((total - round1Vendor) * 0.0119).toFixed(2),
    });

    const round2Buyer = Math.round((round1Buyer + round1Vendor) / 2);
    const round2Vendor = Math.round(maxDiscountINR * 0.88);

    rounds.push({
      round: 2,
      buyerOfferINR: total - round2Buyer,
      buyerDiscountINR: round2Buyer,
      buyerMessage: `ProcureAI Buyer Agent: Our authorized Ed25519 spending mandate permits instant escrow lock if distributor meets at ₹${round2Buyer.toLocaleString("en-IN")} (-₹${round2Buyer.toLocaleString("en-IN")}). Delivery SLA must remain guaranteed.`,
      vendorCounterINR: total - round2Vendor,
      vendorDiscountINR: round2Vendor,
      vendorMessage: `Merchant Quote Engine: Verified corporate tier credentials. We can advance to ${tierName} pricing: ₹${round2Vendor.toLocaleString("en-IN")} discount with guaranteed priority dispatch.`,
      buyerOfferUsd: ((total - round2Buyer) * 0.0119).toFixed(2),
      vendorCounterUsd: ((total - round2Vendor) * 0.0119).toFixed(2),
    });

    // Round 3 Final Agreement
    const round3Discount = Math.min(round2Vendor, maxDiscountINR);
    rounds.push({
      round: 3,
      buyerOfferINR: total - round3Discount,
      buyerDiscountINR: round3Discount,
      buyerMessage: `ProcureAI Buyer Agent: Accepted. Locking in ₹${round3Discount.toLocaleString("en-IN")} volume rebate under signed Spending Mandate. Proceeding to PayPal authorization hold.`,
      vendorCounterINR: total - round3Discount,
      vendorDiscountINR: round3Discount,
      vendorMessage: `Merchant Quote Engine: Approved. Promo token PROCURE-B2B-${round3Discount} generated and bound to order session. Floor price margin preserved.`,
      buyerOfferUsd: ((total - round3Discount) * 0.0119).toFixed(2),
      vendorCounterUsd: ((total - round3Discount) * 0.0119).toFixed(2),
    });

    finalDiscountINR = round3Discount;
    accepted = true;
  }

  // Server-side safety clamp: discount cannot exceed max allowed discount
  finalDiscountINR = Math.min(finalDiscountINR, maxDiscountINR);
  const finalTotalINR = Math.max(0, total - finalDiscountINR);
  const finalTotalUSD = (finalTotalINR * 0.0119).toFixed(2);
  const rebateCode = `PROCURE-B2B-${finalDiscountINR}`;

  const negotiationId = `neg_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;

  // Persist into SQLite
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO negotiations (id, plan_id, rounds_json, final_discount_inr, accepted, mode, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    negotiationId,
    planId || "unknown_plan",
    JSON.stringify(rounds),
    finalDiscountINR,
    accepted ? 1 : 0,
    mode,
    new Date().toISOString()
  );

  appendAuditLog("NEGOTIATION_COMPLETED", "negotiation", negotiationId, "ai_agent", {
    planId,
    mode,
    originalTotalINR: total,
    finalDiscountINR,
    finalTotalINR,
    accepted,
  });

  return {
    id: negotiationId,
    planId,
    mode, // "GEMINI_LLM" or "OFFLINE_SIMULATION"
    accepted,
    originalTotalINR: total,
    finalDiscountINR,
    finalTotalINR,
    finalTotalUSD,
    rebateCode,
    rounds,
    upgradeSuggestions: generateUpgradeSuggestions(items, total),
    marginMetrics: {
      vendorFloorPriceINR: floorPriceINR,
      maxAllowedDiscountINR: maxDiscountINR,
      discountPct: Number(((finalDiscountINR / total) * 100).toFixed(2)),
      tierName,
      laptopCount,
    },
  };
}

/**
 * Multi-round LLM negotiation using Gemini with strict JSON schemas.
 */
async function runGeminiNegotiation({ items, total, targetDiscount, maxDiscountINR, maxRounds, apiKey }) {
  const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

  const prompt = `You are running a 2-agent autonomous B2B procurement negotiation.
Buyer Agent: Represents an Indian office manager procuring equipment with a PayPal pay-on-delivery authorization hold. Target discount is ₹${targetDiscount}.
Vendor Agent: Represents the wholesale electronics distributor. Floor price is ₹${total - maxDiscountINR} (max discount cannot exceed ₹${maxDiscountINR}).
Items: ${JSON.stringify(items.map((i) => ({ name: i.name, qty: i.quantity, price: i.unitPriceINR })))}.
Total Order INR: ₹${total}.

Simulate a realistic 3-round professional negotiation where:
- Round 1: Buyer pitches volume/authorization hold discount; Vendor makes cautious counter.
- Round 2: Buyer counters using pay-on-delivery payment certainty; Vendor increases concession within margin floor.
- Round 3: Both reach agreement on a realistic rebate <= ₹${maxDiscountINR}.

Return strictly structured JSON.`;

  const schema = {
    type: "OBJECT",
    properties: {
      finalDiscountINR: { type: "NUMBER" },
      accepted: { type: "BOOLEAN" },
      rounds: {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: {
            round: { type: "INTEGER" },
            buyerOfferINR: { type: "NUMBER" },
            buyerDiscountINR: { type: "NUMBER" },
            buyerMessage: { type: "STRING" },
            vendorCounterINR: { type: "NUMBER" },
            vendorDiscountINR: { type: "NUMBER" },
            vendorMessage: { type: "STRING" },
          },
          required: ["round", "buyerOfferINR", "buyerDiscountINR", "buyerMessage", "vendorCounterINR", "vendorDiscountINR", "vendorMessage"],
        },
      },
    },
    required: ["finalDiscountINR", "accepted", "rounds"],
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    signal: controller.signal,
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: schema,
      },
    }),
  });
  clearTimeout(timeout);

  if (!response.ok) {
    throw new Error(`Gemini API error: ${response.status}`);
  }

  const data = await response.json();
  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawText) {
    throw new Error("Empty response from Gemini");
  }

  const parsed = JSON.parse(rawText);
  // Add formatted USD fields
  parsed.rounds = parsed.rounds.map((r) => ({
    ...r,
    buyerOfferUsd: (r.buyerOfferINR * 0.0119).toFixed(2),
    vendorCounterUsd: (r.vendorCounterINR * 0.0119).toFixed(2),
  }));

  return parsed;
}

module.exports = {
  negotiateVendorDiscount,
  calculateVendorFloor,
};

