"use strict";

const crypto = require("node:crypto");
const { getDb, appendAuditLog } = require("./db");

const DEFAULT_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

/**
 * Deterministic Vendor floor policy:
 * - Vendor has base margin of 12-15%
 * - Max allowable discount is bounded by minimum floor margin (e.g. 5.5% max discount)
 * - Volume rule: order total >= ₹30,000 unlocks up to 3-5% discount
 * - No discount can ever be approved below the vendor's hard cost floor!
 */
function calculateVendorFloor(totalINR, itemCount) {
  const isBulk = itemCount >= 3 || totalINR >= 35000;
  const maxDiscountPct = isBulk ? 5.5 : 3.0; // Max 5.5% on bulk
  const maxDiscountINR = Math.round(totalINR * (maxDiscountPct / 100));
  const floorPriceINR = totalINR - maxDiscountINR;

  return {
    floorPriceINR,
    maxDiscountINR,
    maxDiscountPct,
    isBulk,
  };
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
  const { floorPriceINR, maxDiscountINR, maxDiscountPct } = calculateVendorFloor(total, count);

  const targetDiscount = targetDiscountINR
    ? Math.min(Number(targetDiscountINR), Math.round(total * 0.08))
    : Math.round(total * 0.05); // Default target 5%

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
    // 3 realistic rounds
    const round1Buyer = Math.round(targetDiscount * 1.15); // Buyer asks for high discount
    const round1Vendor = Math.round(maxDiscountINR * 0.45); // Vendor counters conservative
    rounds.push({
      round: 1,
      buyerOfferINR: total - round1Buyer,
      buyerDiscountINR: round1Buyer,
      buyerMessage: `ProcureAI Buyer Agent: We are executing a corporate bundle purchase of ${count} items (₹${total.toLocaleString()}) with an immediate PayPal pay-on-delivery authorization hold. We request a ₹${round1Buyer.toLocaleString()} (${((round1Buyer / total) * 100).toFixed(1)}%) volume concession.`,
      vendorCounterINR: total - round1Vendor,
      vendorDiscountINR: round1Vendor,
      vendorMessage: `Merchant Quote Engine: Standard distributor margin restricts unbundled discounts. Given the ${count}-unit bundle, we can offer an initial educational/B2B concession of ₹${round1Vendor.toLocaleString()} (${((round1Vendor / total) * 100).toFixed(1)}%).`,
      buyerOfferUsd: ((total - round1Buyer) * 0.0119).toFixed(2),
      vendorCounterUsd: ((total - round1Vendor) * 0.0119).toFixed(2),
    });

    const round2Buyer = Math.round((round1Buyer + round1Vendor) / 2); // Split difference
    const round2Vendor = Math.round(maxDiscountINR * 0.85); // Vendor moves closer to floor
    rounds.push({
      round: 2,
      buyerOfferINR: total - round2Buyer,
      buyerDiscountINR: round2Buyer,
      buyerMessage: `ProcureAI Buyer Agent: Our authorized spending mandate permits immediate settlement if you can meet at ₹${round2Buyer.toLocaleString()} (-₹${round2Buyer.toLocaleString()}). Delivery SLA must remain <= 7 days.`,
      vendorCounterINR: total - round2Vendor,
      vendorDiscountINR: round2Vendor,
      vendorMessage: `Merchant Quote Engine: Verified verified buyer tier. We can advance to tier-2 volume pricing: ₹${round2Vendor.toLocaleString()} discount with guaranteed 5-day dispatch.`,
      buyerOfferUsd: ((total - round2Buyer) * 0.0119).toFixed(2),
      vendorCounterUsd: ((total - round2Vendor) * 0.0119).toFixed(2),
    });

    // Round 3 Final Agreement
    const round3Discount = Math.min(round2Vendor, maxDiscountINR);
    rounds.push({
      round: 3,
      buyerOfferINR: total - round3Discount,
      buyerDiscountINR: round3Discount,
      buyerMessage: `ProcureAI Buyer Agent: Accepted. Locking in ₹${round3Discount.toLocaleString()} volume rebate under signed Spending Mandate. Proceeding to PayPal authorization.`,
      vendorCounterINR: total - round3Discount,
      vendorDiscountINR: round3Discount,
      vendorMessage: `Merchant Quote Engine: Approved. Promo token B2B-AUTHHOLD-${round3Discount} generated and bound to order session.`,
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
    marginMetrics: {
      vendorFloorPriceINR: floorPriceINR,
      maxAllowedDiscountINR: maxDiscountINR,
      discountPct: Number(((finalDiscountINR / total) * 100).toFixed(2)),
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

