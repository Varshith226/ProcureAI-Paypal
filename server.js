// server.js
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const crypto = require("node:crypto");
const path = require("node:path");
const fs = require("node:fs");
const { createAIRouter, aiJsonErrorHandler } = require("./src/routes/ai");

const {
  createProcurementRouter,
  procurementJsonErrorHandler,
} = require("./src/routes/procurement");

const app = express();
app.use(cors());
app.use(express.json());
app.use("/api/ai", createAIRouter());
app.use("/api/ai", aiJsonErrorHandler);

// Catalog, verification and basket optimization (plans only — no payment here)
app.use("/api/procurement", createProcurementRouter());
app.use("/api/procurement", procurementJsonErrorHandler);

const {
  PAYPAL_CLIENT_ID,
  PAYPAL_CLIENT_SECRET,
  PAYPAL_BASE_URL,
} = process.env;

// In-memory store for generated & locked procurement plans
const plansStore = new Map();
const INR_TO_USD_RATE = 0.0119; // Deterministic conversion for PayPal Sandbox settlement

// Production static file hosting for Render / single-service deployments
const clientDistPath = path.join(__dirname, "client", "dist");
if (fs.existsSync(clientDistPath)) {
  app.use(express.static(clientDistPath, { index: false }));
}

app.get("/", (req, res) => {
  const wantsJson = req.xhr || (req.headers.accept && req.headers.accept.includes("application/json")) || !req.headers.accept?.includes("text/html");
  if (wantsJson || !fs.existsSync(path.join(clientDistPath, "index.html"))) {
    return res.json({
      message: "PayPal AI Hackathon backend is running!",
      environment: "sandbox",
    });
  }
  return res.sendFile(path.join(clientDistPath, "index.html"));
});

app.get("/api/paypal/status", (req, res) => {
  res.json({
    configured: Boolean(PAYPAL_CLIENT_ID && PAYPAL_CLIENT_SECRET && PAYPAL_BASE_URL),
    environment: "sandbox",
  });
});

async function getPayPalAccessToken() {
  const credentials = Buffer.from(
    `${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`
  ).toString("base64");

  const response = await fetch(`${PAYPAL_BASE_URL}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error_description || "PayPal authentication failed");
  }
  return data.access_token;
}

app.get("/api/paypal/test-connection", async (req, res) => {
  if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET || !PAYPAL_BASE_URL) {
    return res.status(500).json({ error: "Missing PayPal sandbox credentials in .env" });
  }
  try {
    await getPayPalAccessToken();
    res.json({
      connected: true,
      environment: "sandbox",
      message: "PayPal authentication successful!",
    });
  } catch (error) {
    res.status(502).json({ error: error.message });
  }
});

// Save or register a generated plan on the server
app.post("/api/plans/register", (req, res) => {
  const plan = req.body;
  if (!plan || !plan.planId) {
    return res.status(400).json({ error: "Invalid plan payload" });
  }
  plansStore.set(plan.planId, {
    ...plan,
    status: "DRAFT",
    approvedStrategyKey: null,
    lockedTotalINR: null,
    lockedTotalUSD: null,
  });
  res.json(plansStore.get(plan.planId));
});

// Approve & lock a specific strategy before PayPal checkout (supports AI negotiated rebates)
app.post("/api/plans/:planId/approve", (req, res) => {
  const { planId } = req.params;
  const { strategyKey, version, strategyData, rebateINR, negotiationData } = req.body;

  let plan = plansStore.get(planId);
  if (!plan) {
    if (!strategyData) {
      return res.status(404).json({ error: "Plan not found" });
    }
    // Allow frontend mock/initial plans to register & lock seamlessly
    plan = { planId, version: version || 1, strategies: { [strategyKey]: strategyData } };
  } else {
    // If strategyData is passed, update or add the strategy
    if (strategyData) {
      plan.strategies = plan.strategies || {};
      plan.strategies[strategyKey] = strategyData;
    }
    // Synchronize version when approved
    if (version !== undefined && version !== null) {
      plan.version = version;
    }
  }
  if (!plan || !plan.strategies?.[strategyKey]) {
    return res.status(404).json({ error: "Plan or strategy not found" });
  }

  const chosen = plan.strategies[strategyKey];
  // Calculate authoritative INR total on server from itemized quantities * unitPriceINR
  const rawINR = chosen.items.reduce(
    (sum, item) => sum + item.unitPriceINR * (item.quantity || 1) + (item.shippingINR || 0),
    0
  );
  const appliedRebate = Math.max(0, Number(rebateINR) || 0);
  const calculatedINR = Math.max(0, rawINR - appliedRebate);
  const settlementUSD = (calculatedINR * INR_TO_USD_RATE).toFixed(2);

  const lockedRecord = {
    ...plan,
    version: plan.version || version || 1,
    status: "APPROVED",
    approvedStrategyKey: strategyKey,
    lockedTotalINR: calculatedINR,
    lockedTotalUSD: settlementUSD,
    rebateINR: appliedRebate,
    negotiationData: negotiationData || null,
    lockedAtISO: new Date().toISOString(),
  };

  plansStore.set(planId, lockedRecord);
  res.json(lockedRecord);
});

// Simulate a retailer catalog price change after user approval (Triggers Safety Boundary)
app.post("/api/plans/:planId/simulate-price-change", (req, res) => {
  const { planId } = req.params;
  const { deltaINR = 2500 } = req.body;
  const plan = plansStore.get(planId);

  if (!plan) {
    return res.status(404).json({ error: "Plan not found" });
  }

  plan.version += 1;
  plan.status = "STALE_REAPPROVAL_REQUIRED";
  plan.pendingTotalINR = (plan.lockedTotalINR || 0) + deltaINR;
  plan.pendingTotalUSD = (plan.pendingTotalINR * INR_TO_USD_RATE).toFixed(2);

  plansStore.set(planId, plan);
  res.json({
    message: "Retailer price change detected! Plan invalidated until user re-approves new total.",
    plan,
  });
});

// Create an itemized PayPal Sandbox order bound to the locked plan total (supports full or split-pay)
app.post("/api/paypal/create-order", async (req, res) => {
  try {
    const { planId, version, splitShareUSD, splitCount } = req.body;
    const plan = plansStore.get(planId);

    if (!plan || plan.status !== "APPROVED") {
      return res.status(400).json({
        error: "Safety Boundary: Plan must be explicitly APPROVED before creating a PayPal order.",
      });
    }
    if (version && plan.version !== version) {
      return res.status(409).json({
        error: `Plan version mismatch (server has v${plan.version}, client sent v${version}). Re-approval required.`,
      });
    }

    const token = await getPayPalAccessToken();
    const effectiveUSD = splitShareUSD && Number(splitShareUSD) > 0
      ? Number(splitShareUSD).toFixed(2)
      : String(plan.lockedTotalUSD);

    const description = splitShareUSD && Number(splitShareUSD) > 0
      ? `ProcureAI ${plan.planId} - Co-Buyer Share (1 of ${splitCount || 2}) - Total INR ${plan.lockedTotalINR}`
      : `ProcureAI ${plan.planId} (${plan.approvedStrategyKey || "approved"}) - Total INR ${plan.lockedTotalINR}`;

    // Itemized payload for PayPal Orders v2 API with cent-accurate breakdown matching
    const approvedStrategy = plan.strategies?.[plan.approvedStrategyKey];
    const items = approvedStrategy?.items || [];
    let purchaseUnit = {
      reference_id: `${plan.planId}_${plan.approvedStrategyKey || "approved"}`,
      description,
      amount: {
        currency_code: "USD",
        value: String(effectiveUSD),
      },
    };

    if (splitShareUSD && Number(splitShareUSD) > 0) {
      // Co-Pay mode itemized representation
      purchaseUnit.amount.breakdown = {
        item_total: {
          currency_code: "USD",
          value: String(effectiveUSD),
        },
      };
      purchaseUnit.items = [
        {
          name: `Co-Buyer Share (1 of ${splitCount || 2}) - Plan ${plan.planId}`.substring(0, 127),
          quantity: "1",
          unit_amount: {
            currency_code: "USD",
            value: String(effectiveUSD),
          },
          category: "PHYSICAL_GOODS",
        },
      ];
    } else if (items.length > 0) {
      // Full settlement: itemized mapping with cent rounding reconciliation
      let computedTotalCents = 0;
      const paypalItems = items.map((it, idx) => {
        const qty = Math.max(1, Number(it.quantity) || 1);
        const itemLineINR = it.unitPriceINR + (it.shippingINR || 0);
        const unitCent = Math.round(itemLineINR * INR_TO_USD_RATE * 100);
        computedTotalCents += unitCent * qty;
        return {
          name: (it.name || it.productId || `Procured Item ${idx + 1}`).substring(0, 127),
          quantity: String(qty),
          unit_amount: {
            currency_code: "USD",
            value: (unitCent / 100).toFixed(2),
          },
          category: "PHYSICAL_GOODS",
        };
      });

      const targetCents = Math.round(Number(effectiveUSD) * 100);
      const diffCents = targetCents - computedTotalCents;
      if (diffCents !== 0 && paypalItems.length > 0) {
        const firstQty = Number(paypalItems[0].quantity);
        if (firstQty === 1) {
          const adj = Math.round(Number(paypalItems[0].unit_amount.value) * 100) + diffCents;
          paypalItems[0].unit_amount.value = (adj / 100).toFixed(2);
        } else {
          paypalItems.push({
            name: "ProcureAI B2B Discount / Optimization Line",
            quantity: "1",
            unit_amount: {
              currency_code: "USD",
              value: (diffCents / 100).toFixed(2),
            },
            category: "PHYSICAL_GOODS",
          });
        }
      }

      // Re-sum to ensure exact cent-for-cent match
      const finalSumCents = paypalItems.reduce(
        (acc, it) => acc + Math.round(Number(it.unit_amount.value) * 100) * Number(it.quantity),
        0
      );
      const finalUSD = (finalSumCents / 100).toFixed(2);

      purchaseUnit.amount.value = finalUSD;
      purchaseUnit.amount.breakdown = {
        item_total: {
          currency_code: "USD",
          value: finalUSD,
        },
      };
      purchaseUnit.items = paypalItems;
    }

    const response = await fetch(`${PAYPAL_BASE_URL}/v2/checkout/orders`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "PayPal-Request-Id": crypto.randomUUID(),
      },
      body: JSON.stringify({
        intent: "CAPTURE",
        purchase_units: [purchaseUnit],
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("PayPal create order API error:", data);
      return res.status(response.status).json({
        error: data.message || "Could not create PayPal order",
        details: data.details?.[0]?.description || data.message,
      });
    }

    const approval = data.links?.find((link) => link.rel === "approve");

    res.json({
      id: data.id,
      orderID: data.id,
      approvalUrl: approval?.href,
      lockedTotalINR: plan.lockedTotalINR,
      lockedTotalUSD: effectiveUSD,
      isSplitPay: Boolean(splitShareUSD),
    });
  } catch (error) {
    res.status(502).json({ error: error.message });
  }
});

// Capture an approved sandbox order
app.post("/api/paypal/capture-order", async (req, res) => {
  const { orderID, planId } = req.body;

  if (!orderID) {
    return res.status(400).json({ error: "orderID is required" });
  }

  try {
    const token = await getPayPalAccessToken();

    const response = await fetch(
      `${PAYPAL_BASE_URL}/v2/checkout/orders/${encodeURIComponent(orderID)}/capture`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "PayPal-Request-Id": crypto.randomUUID(),
        },
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: "Could not capture PayPal order",
        details: data.message,
      });
    }

    if (planId && plansStore.has(planId)) {
      const plan = plansStore.get(planId);
      plan.status = "PAID";
      plan.captureID = data.purchase_units?.[0]?.payments?.captures?.[0]?.id;
    }

    res.json({
      orderID: data.id,
      status: data.status,
      captureID: data.purchase_units?.[0]?.payments?.captures?.[0]?.id,
      payerEmail: data.payer?.email_address,
      capturedAtISO: new Date().toISOString(),
    });
  } catch (error) {
    res.status(502).json({ error: error.message });
  }
});

// Refund a captured PayPal payment (SLA Protection / Price Protection API)
app.post("/api/paypal/refund-capture", async (req, res) => {
  const { captureID, amountUSD, reason } = req.body;

  if (!captureID) {
    return res.status(400).json({ error: "captureID is required" });
  }

  try {
    const token = await getPayPalAccessToken();

    const payload = {};
    if (amountUSD && Number(amountUSD) > 0) {
      payload.amount = {
        value: typeof amountUSD === "number" ? amountUSD.toFixed(2) : String(amountUSD),
        currency_code: "USD",
      };
    }
    if (reason) {
      payload.note_to_payer = reason;
    }

    const response = await fetch(
      `${PAYPAL_BASE_URL}/v2/payments/captures/${encodeURIComponent(captureID)}/refund`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "PayPal-Request-Id": crypto.randomUUID(),
        },
        body: Object.keys(payload).length > 0 ? JSON.stringify(payload) : "{}",
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: "Could not refund PayPal capture",
        details: data.message || data.details || data.error_description,
      });
    }

    res.json({
      refundID: data.id,
      status: data.status,
      amountUSD: data.amount?.value,
      currency: data.amount?.currency_code || "USD",
      noteToPayer: data.note_to_payer,
      refundedAtISO: new Date().toISOString(),
    });
  } catch (error) {
    res.status(502).json({ error: error.message });
  }
});


// SPA fallback for HTML clients in production
app.use((req, res, next) => {
  if (req.method !== "GET" || req.path.startsWith("/api/")) {
    return next();
  }
  const indexPath = path.join(clientDistPath, "index.html");
  if (fs.existsSync(indexPath)) {
    return res.sendFile(indexPath);
  }
  next();
});

const PORT = process.env.PORT || 3000;

// Only listen when run directly (`node server.js`); tests import `app` instead.
if (require.main === module) {
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running at http://localhost:${PORT}`);
  });
}

module.exports = app;
