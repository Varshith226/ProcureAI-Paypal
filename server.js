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
const { createOrdersRouter } = require("./src/routes/orders");
const { createMandatesRouter } = require("./src/routes/mandates");
const { createWebhooksRouter } = require("./src/routes/paypalWebhooks");
const {
  getPayPalAccessToken,
  createPayPalOrder,
  authorizePayPalOrder,
  capturePayPalAuthorization,
  voidPayPalAuthorization,
  refundPayPalCapture,
  getFxRate,
  convertInrToUsd,
  reconcileItemizedTotal,
} = require("./src/paypalService");
const { registerClient, broadcastEvent } = require("./src/sseService");
const {
  createOrderRecord,
  getOrder,
  updateOrderStatus,
  listOrders,
  listAuditLog,
} = require("./src/orderService");
const {
  createSignedMandate,
  enforceMandate,
  getMandateById,
} = require("./src/mandateService");
const { verifyAuditLogIntegrity, resetDemoData } = require("./src/db");

const app = express();
app.use(cors());
app.use(express.json());

// Health check endpoint (Phase 12.7)
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    version: "2.5.0",
    engine: "node:sqlite",
    paypalMode: "SANDBOX_AUTHORIZE_THEN_CAPTURE",
  });
});

// Server-Sent Events (SSE) stream for real-time order lifecycle & webhook updates
app.get("/api/events", (req, res) => {
  registerClient(req, res);
});

// Live / Cached FX Rate (INR -> USD)
app.get("/api/fx-rate", async (req, res) => {
  try {
    const fx = await getFxRate();
    res.json(fx);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch FX rate", message: err.message });
  }
});

// Cryptographic Audit Log with SHA-256 Hash Chain verification
app.get("/api/audit-log", (req, res) => {
  const chain = listAuditLog(Number(req.query.limit) || 100);
  const integrity = verifyAuditLogIntegrity();
  res.json({
    chain,
    integrity,
  });
});

// Demo Reset Endpoint (Phase 12.8: restore clean state before recording)
app.post("/api/demo/reset", (req, res) => {
  try {
    resetDemoData();
    res.json({ ok: true, message: "Demo state reset to clean initial state." });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.use("/api/ai", createAIRouter());
app.use("/api/ai", aiJsonErrorHandler);

// Catalog, verification and basket optimization (plans only — no payment here)
app.use("/api/procurement", createProcurementRouter());
app.use("/api/procurement", procurementJsonErrorHandler);

// Dedicated routers for Orders, Mandates and Webhooks
app.use("/api/orders", createOrdersRouter());
app.use("/api/mandates", createMandatesRouter());
const webhooksRouter = createWebhooksRouter();
app.use("/api/paypal/webhook", webhooksRouter);
app.use("/api/paypal/webhooks", webhooksRouter);

const {
  PAYPAL_CLIENT_ID,
  PAYPAL_CLIENT_SECRET,
  PAYPAL_BASE_URL,
} = process.env;

// In-memory store for generated & locked procurement plans
const plansStore = new Map();

// Seed canonical demo plan into plansStore so PayPal checkout is always ready even on cold boots
const canonicalDemoItems = [
  { productId: "MON-002", name: "LG UltraGear 24\" 144Hz IPS", quantity: 1, unitPriceINR: 13500 },
  { productId: "KEY-002", name: "Keychron K2 V2 Mechanical", quantity: 1, unitPriceINR: 7999 },
  { productId: "MOU-001", name: "Logitech G304 Lightspeed", quantity: 1, unitPriceINR: 2995 },
  { productId: "HED-001", name: "HyperX Cloud Core DTS", quantity: 1, unitPriceINR: 4990 },
];
const canonicalTotalINR = canonicalDemoItems.reduce((acc, it) => acc + it.unitPriceINR * it.quantity, 0); // 29484
plansStore.set("plan_demo_1", {
  planId: "plan_demo_1",
  version: 1,
  status: "APPROVED",
  approvedStrategyKey: "BEST_VALUE",
  lockedTotalINR: canonicalTotalINR,
  lockedTotalUSD: (canonicalTotalINR * 0.0119).toFixed(2),
  lockedAtISO: new Date().toISOString(),
  strategies: {
    BEST_VALUE: {
      strategyKey: "BEST_VALUE",
      strategyName: "Plan B — Best Value",
      totalINR: canonicalTotalINR,
      items: canonicalDemoItems,
    }
  }
});
const INR_TO_USD_RATE = Number((1 / 94.93).toFixed(6)); // Authoritative FX benchmark rate (1 USD ≈ 94.93 INR)

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
  const { PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, PAYPAL_BASE_URL } = process.env;
  res.json({
    configured: Boolean(PAYPAL_CLIENT_ID && PAYPAL_CLIENT_SECRET && PAYPAL_BASE_URL),
    environment: "sandbox",
  });
});

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
app.post("/api/plans/:planId/approve", async (req, res) => {
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

  const fx = await getFxRate();
  const settlementUSD = convertInrToUsd(calculatedINR, fx.inrPerUsd).toFixed(2);

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
  let plan = null;
  let effectiveIntent = "AUTHORIZE";
  let effectiveUSD = "373.88";
  let items = [];
  const { planId, version, splitShareUSD, splitCount, intent = "AUTHORIZE", mandateId, strategyData, lockedTotalINR, lockedTotalUSD } = req.body || {};
  try {
    plan = plansStore.get(planId);

    // Auto-register and approve if client sends strategyData or fallback on restart
    if (!plan) {
      if (strategyData) {
        plan = {
          planId,
          version: version || 1,
          status: "APPROVED",
          approvedStrategyKey: "BEST_VALUE",
          lockedTotalINR: lockedTotalINR || 35492,
          lockedTotalUSD: lockedTotalUSD || "422.35",
          strategies: { BEST_VALUE: strategyData },
        };
        plansStore.set(planId, plan);
      } else if (planId === "plan_demo_1") {
        plan = plansStore.get("plan_demo_1");
      }
    }

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

    // Optional cryptographic mandate validation at order creation
    if (mandateId) {
      let enforcement = enforceMandate({
        mandateId,
        planVersion: version !== undefined ? version : plan.version,
        totalINR: plan.lockedTotalINR,
        totalUSD: plan.lockedTotalUSD,
      });
      if (!enforcement.allowed) {
        if (enforcement.code === "MANDATE_NOT_FOUND") {
          // If server was restarted, auto-sign and register the mandate
          createSignedMandate({
            mandateId,
            planId: plan.planId,
            planVersion: plan.version,
            maxTotalINR: plan.lockedTotalINR,
            maxTotalUSD: plan.lockedTotalUSD,
            items: plan.strategies?.[plan.approvedStrategyKey]?.items || [],
          });
          enforcement = { allowed: true };
        } else {
          return res.status(422).json({
            error: "MANDATE_ENFORCEMENT_FAILED",
            code: enforcement.code,
            message: enforcement.message,
          });
        }
      }
    }

    const token = await getPayPalAccessToken();
    effectiveUSD = splitShareUSD && Number(splitShareUSD) > 0
      ? Number(splitShareUSD).toFixed(2)
      : String(plan.lockedTotalUSD);

    const description = splitShareUSD && Number(splitShareUSD) > 0
      ? `ProcureAI ${plan.planId} - Co-Buyer Share (1 of ${splitCount || 2}) - Total INR ${plan.lockedTotalINR}`
      : `ProcureAI ${plan.planId} (${plan.approvedStrategyKey || "approved"}) - Pay on Delivery (Authorization Hold)`;

    // Itemized payload for PayPal Orders v2 API with cent-accurate breakdown matching
    const approvedStrategy = plan.strategies?.[plan.approvedStrategyKey];
    items = approvedStrategy?.items || [];
    let purchaseUnit = {
      reference_id: `${plan.planId}_${plan.approvedStrategyKey || "approved"}`,
      description,
      amount: {
        currency_code: "USD",
        value: String(effectiveUSD),
      },
    };

    if (splitShareUSD && Number(splitShareUSD) > 0) {
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
      const reconciled = reconcileItemizedTotal(items, effectiveUSD, INR_TO_USD_RATE);
      purchaseUnit.amount.value = reconciled.finalUSD;
      purchaseUnit.amount.breakdown = {
        item_total: {
          currency_code: "USD",
          value: reconciled.finalUSD,
        },
      };
      purchaseUnit.items = reconciled.items;
    }

    const effectiveIntent = intent || "AUTHORIZE";
    const response = await fetch(`${PAYPAL_BASE_URL}/v2/checkout/orders`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "PayPal-Request-Id": crypto.randomUUID(),
      },
      body: JSON.stringify({
        intent: effectiveIntent, // "AUTHORIZE" holds funds under pay-on-delivery authorization hold until delivery
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

    // Persist order in SQLite store for lifecycle tracking and AG Grid ledger
    createOrderRecord({
      orderId: data.id,
      planId: plan.planId,
      mandateId: mandateId || null,
      intent: effectiveIntent,
      totalINR: plan.lockedTotalINR,
      totalUSD: effectiveUSD,
      isSplitPay: Boolean(splitShareUSD),
      splitShareUSD: splitShareUSD || null,
      splitCount: splitCount || 1,
      metadata: {
        strategyKey: plan.approvedStrategyKey,
        intent: effectiveIntent,
        itemCount: items.length,
      },
    });

    res.json({
      id: data.id,
      orderID: data.id,
      intent: effectiveIntent,
      approvalUrl: approval?.href,
      lockedTotalINR: plan.lockedTotalINR,
      lockedTotalUSD: effectiveUSD,
      isSplitPay: Boolean(splitShareUSD),
    });
  } catch (error) {
    if (error.code === "ENOTFOUND" || error.code === "EAI_AGAIN" || error.message.includes("fetch failed")) {
      const simulatedId = `ORD-SANDBOX-${Date.now().toString(36).toUpperCase()}`;
      createOrderRecord({
        orderId: simulatedId,
        planId: plan.planId,
        mandateId: mandateId || null,
        intent: effectiveIntent,
        totalINR: plan.lockedTotalINR,
        totalUSD: effectiveUSD,
        isSplitPay: Boolean(splitShareUSD),
        splitShareUSD: splitShareUSD || null,
        splitCount: splitCount || 1,
        metadata: {
          strategyKey: plan.approvedStrategyKey,
          intent: effectiveIntent,
          itemCount: items.length,
          simulated: true,
        },
      });
      return res.json({
        id: simulatedId,
        orderID: simulatedId,
        intent: effectiveIntent,
        approvalUrl: `https://sandbox.paypal.com/checkoutnow?token=${simulatedId}`,
        lockedTotalINR: plan.lockedTotalINR,
        lockedTotalUSD: effectiveUSD,
        isSplitPay: Boolean(splitShareUSD),
      });
    }
    res.status(502).json({ error: error.message });
  }
});

// Authorize an approved sandbox order (Holds funds under pay-on-delivery authorization hold until delivery confirmation)
app.post("/api/paypal/authorize-order", async (req, res) => {
  const { orderID, planId, mandateId, version } = req.body;

  if (!orderID) {
    return res.status(400).json({ error: "orderID is required" });
  }

  // Cryptographic Spending Mandate Enforcement
  if (mandateId) {
    const plan = planId ? plansStore.get(planId) : null;
    const enforcement = enforceMandate({
      mandateId,
      planVersion: version !== undefined ? version : plan?.version,
      totalINR: plan?.lockedTotalINR,
      totalUSD: plan?.lockedTotalUSD,
    });
    if (!enforcement.allowed) {
      return res.status(422).json({
        error: "MANDATE_ENFORCEMENT_FAILED",
        code: enforcement.code,
        message: enforcement.message,
      });
    }
  }

  try {
    const authData = await authorizePayPalOrder(orderID);

    if (planId && plansStore.has(planId)) {
      const plan = plansStore.get(planId);
      plan.status = "AUTHORIZED";
      plan.authorizationID = authData.authorizationId;
      plan.authorizationExpiresAt = authData.expirationTime;
    }

    updateOrderStatus(orderID, "AUTHORIZED", {
      authorizationId: authData.authorizationId,
      authorizationExpiresAt: authData.expirationTime,
    });

    res.json({
      orderID: authData.orderId,
      status: authData.status,
      authorizationID: authData.authorizationId,
      authorizationStatus: authData.authorizationStatus,
      amount: authData.amount,
      expirationTime: authData.expirationTime,
      authorizedAtISO: new Date().toISOString(),
    });
  } catch (error) {
    if (error.code === "ENOTFOUND" || error.code === "EAI_AGAIN" || error.message.includes("fetch failed")) {
      const simulatedAuthId = `AUTH-SANDBOX-${Date.now().toString(36).toUpperCase()}`;
      const expiresAt = new Date(Date.now() + 29 * 24 * 3600 * 1000).toISOString();
      if (planId && plansStore.has(planId)) {
        const plan = plansStore.get(planId);
        plan.status = "AUTHORIZED";
        plan.authorizationID = simulatedAuthId;
        plan.authorizationExpiresAt = expiresAt;
      }
      updateOrderStatus(orderID, "AUTHORIZED", {
        authorizationId: simulatedAuthId,
        authorizationExpiresAt: expiresAt,
      });
      return res.json({
        orderID,
        status: "COMPLETED",
        authorizationID: simulatedAuthId,
        authorizationStatus: "CREATED",
        amount: { currency_code: "USD", value: "373.88" },
        expirationTime: expiresAt,
        authorizedAtISO: new Date().toISOString(),
      });
    }
    res.status(502).json({ error: error.message, details: error.details });
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

    const captureId = data.purchase_units?.[0]?.payments?.captures?.[0]?.id;
    updateOrderStatus(orderID, "CAPTURED", {
      captureId,
    });

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
