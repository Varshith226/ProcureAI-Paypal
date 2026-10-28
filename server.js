// server.js
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const crypto = require("node:crypto");
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

app.get("/", (req, res) => {
  res.json({
    message: "PayPal AI Hackathon backend is running!",
    environment: "sandbox",
  });
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

// Approve & lock a specific strategy before PayPal checkout
app.post("/api/plans/:planId/approve", (req, res) => {
  const { planId } = req.params;
  const { strategyKey, version, strategyData } = req.body;

  let plan = plansStore.get(planId);
  if (!plan && strategyData) {
    // Allow frontend mock/initial plans to register & lock seamlessly
    plan = { planId, version: version || 1, strategies: { [strategyKey]: strategyData } };
  }
  if (!plan || !plan.strategies?.[strategyKey]) {
    return res.status(404).json({ error: "Plan or strategy not found" });
  }

  const chosen = plan.strategies[strategyKey];
  // Calculate authoritative INR total on server from itemized quantities * unitPriceINR
  const calculatedINR = chosen.items.reduce(
    (sum, item) => sum + item.unitPriceINR * (item.quantity || 1) + (item.shippingINR || 0),
    0
  );
  const settlementUSD = (calculatedINR * INR_TO_USD_RATE).toFixed(2);

  const lockedRecord = {
    ...plan,
    status: "APPROVED",
    approvedStrategyKey: strategyKey,
    lockedTotalINR: calculatedINR,
    lockedTotalUSD: settlementUSD,
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

// Create a PayPal Sandbox order bound to the locked plan total
app.post("/api/paypal/create-order", async (req, res) => {
  try {
    const { planId, version } = req.body;
    const plan = plansStore.get(planId);

    if (!plan || plan.status !== "APPROVED") {
      return res.status(400).json({
        error: "Safety Boundary: Plan must be explicitly APPROVED before creating a PayPal order.",
      });
    }
    if (version && plan.version !== version) {
      return res.status(409).json({
        error: "Plan version mismatch. Re-approval required.",
      });
    }

    const token = await getPayPalAccessToken();

    const response = await fetch(`${PAYPAL_BASE_URL}/v2/checkout/orders`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "PayPal-Request-Id": crypto.randomUUID(),
      },
      body: JSON.stringify({
        intent: "CAPTURE",
        purchase_units: [
          {
            reference_id: `${plan.planId}_${plan.approvedStrategyKey}`,
            description: `ProcureAI ${plan.planId} (${plan.approvedStrategyKey}) - Approved Total INR ${plan.lockedTotalINR}`,
            amount: {
              currency_code: "USD",
              value: plan.lockedTotalUSD,
            },
          },
        ],
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: "Could not create PayPal order",
        details: data.message,
      });
    }

    const approval = data.links?.find((link) => link.rel === "approve");

    res.json({
      id: data.id,
      orderID: data.id,
      approvalUrl: approval?.href,
      lockedTotalINR: plan.lockedTotalINR,
      lockedTotalUSD: plan.lockedTotalUSD,
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


const PORT = process.env.PORT || 3000;

// Only listen when run directly (`node server.js`); tests import `app` instead.
if (require.main === module) {
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running at http://localhost:${PORT}`);
  });
}

module.exports = app;
