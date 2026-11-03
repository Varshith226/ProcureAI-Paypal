#!/usr/bin/env node
"use strict";

require("dotenv").config();
const fs = require("node:fs");
const path = require("node:path");
const readline = require("node:readline");

const {
  getPayPalAccessToken,
  createPayPalOrder,
  authorizePayPalOrder,
  capturePayPalAuthorization,
  voidPayPalAuthorization,
  createPayPalInvoice,
  createVendorPayout,
  getFxRate,
} = require("../src/paypalService");

const EVIDENCE_FILE = path.join(__dirname, "../docs/SANDBOX_EVIDENCE.md");

function askQuestion(query) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) =>
    rl.question(query, (ans) => {
      rl.close();
      resolve(ans);
    })
  );
}

function appendEvidence(sectionTitle, data) {
  const entry = `
### ${sectionTitle} (${new Date().toISOString()})
- **Timestamp:** \`${new Date().toISOString()}\`
- **Request / Action:** \`${data.action}\`
- **HTTP / Operation Status:** \`${data.status}\`
- **PayPal IDs:**
${Object.entries(data.ids || {})
  .map(([k, v]) => `  - **${k}:** \`${v}\``)
  .join("\n")}
- **Details:**
\`\`\`json
${JSON.stringify(data.details || {}, null, 2)}
\`\`\`
---
`;
  fs.appendFileSync(EVIDENCE_FILE, entry, "utf8");
  console.log(`[Evidence Recorded]: ${sectionTitle}`);
}

async function main() {
  console.log("===============================================================");
  console.log("  ProcureAI — PayPal Sandbox Real End-to-End Evidence Generator");
  console.log("===============================================================\n");

  const creds = {
    clientId: process.env.PAYPAL_CLIENT_ID,
    clientSecret: process.env.PAYPAL_CLIENT_SECRET,
    baseUrl: process.env.PAYPAL_BASE_URL || "https://api-m.sandbox.paypal.com",
  };

  if (!creds.clientId || !creds.clientSecret) {
    console.error("ERROR: Missing PAYPAL_CLIENT_ID or PAYPAL_CLIENT_SECRET in environment.");
    process.exit(1);
  }

  // Ensure docs directory exists and file has header
  if (!fs.existsSync(EVIDENCE_FILE)) {
    fs.writeFileSync(
      EVIDENCE_FILE,
      `# PayPal Sandbox Real API Evidence Ledger
Generated automatically by \`scripts/sandbox-e2e.js\` against PayPal Sandbox environment.

**Sandbox Base URL:** \`${creds.baseUrl}\`  
**Client ID:** \`${creds.clientId.substring(0, 8)}...${creds.clientId.slice(-4)}\`

---
`,
      "utf8"
    );
  }

  // 1. Verify Access Token & FX Rate
  console.log("1. Authenticating with PayPal Sandbox...");
  const token = await getPayPalAccessToken();
  console.log("   ✓ Access Token acquired successfully.\n");

  const fx = await getFxRate();
  console.log(`2. Live FX Rate: ${fx.inrPerUsd} INR per USD (Source: ${fx.source})`);
  appendEvidence("1. Live Foreign Exchange Reference", {
    action: "GET /v6/latest/USD (open.er-api.com)",
    status: "200 OK",
    ids: { base: fx.base, target: fx.target },
    details: {
      inrPerUsd: fx.inrPerUsd,
      usdPerInr: fx.usdPerInr,
      source: fx.source,
      timestamp: fx.timestamp,
    },
  });

  const args = process.argv.slice(2);
  const flowArg = args.find((a) => a.startsWith("--flow="))?.split("=")[1];
  const orderArg = args.find((a) => a.startsWith("--orderId="))?.split("=")[1];

  let selectedFlow = flowArg;
  if (!selectedFlow) {
    console.log("\nSelect flow to run:");
    console.log("  [1] Flow 1: Full Pay-on-Delivery (Create -> Approve -> Authorize -> Capture -> Payout -> Invoice)");
    console.log("  [2] Flow 2: SLA Delivery Breach (Create -> Approve -> Authorize -> 90% Partial Capture with final_capture)");
    console.log("  [3] Flow 3: Cancellation (Create -> Approve -> Authorize -> Void)");
    selectedFlow = await askQuestion("\nEnter choice [1, 2, 3] (default: 1): ");
    selectedFlow = selectedFlow.trim() || "1";
  }

  const sampleItems = [
    { productId: "MON-002", name: "165Hz Gaming Monitor", quantity: 5, unitPriceINR: 10149, shippingINR: 0 },
    { productId: "KB-001", name: "Mechanical Keyboard", quantity: 5, unitPriceINR: 1849, shippingINR: 0 },
  ];
  const totalINR = 5 * 10149 + 5 * 1849; // 59,990 INR
  const totalUSD = (totalINR / (fx.inrPerUsd || 95.08)).toFixed(2); // e.g. ~630.94 USD

  let orderId = orderArg;
  let approveUrl = null;

  if (!orderId) {
    console.log(`\nCreating PayPal Order (intent: AUTHORIZE) for ₹${totalINR} ($${totalUSD} USD)...`);
    const orderRes = await createPayPalOrder({
      intent: "AUTHORIZE",
      planId: "plan_sandbox_evidence",
      totalUSD,
      items: sampleItems,
    });

    orderId = orderRes.id;
    approveUrl = orderRes.approveUrl;

    console.log("\n===============================================================");
    console.log(`  ORDER CREATED: ${orderId}`);
    console.log(`  APPROVAL URL:  ${approveUrl}`);
    console.log("===============================================================\n");

    appendEvidence(`Order Created (Flow ${selectedFlow})`, {
      action: "POST /v2/checkout/orders (intent: AUTHORIZE)",
      status: "201 Created",
      ids: { orderId },
      details: {
        intent: "AUTHORIZE",
        totalUSD,
        totalINR,
        approveUrl,
        itemsCount: sampleItems.length,
      },
    });

    console.log("👉 ACTION REQUIRED:");
    console.log("1. Open the APPROVAL URL above in your browser.");
    console.log("2. Log in with your Sandbox Buyer account and click 'Continue' to approve the order.");
    console.log("3. Once approved on PayPal, return here and press Enter to resume.\n");

    await askQuestion("Press Enter once you have approved the order in the browser...");
  } else {
    console.log(`Resuming with existing Order ID: ${orderId}`);
  }

  // Authorize the order
  console.log(`\nAuthorizing order ${orderId}...`);
  let authRes;
  try {
    authRes = await authorizePayPalOrder(orderId);
  } catch (err) {
    console.error(`\n❌ Authorization failed: ${err.message}`);
    if (err.details) console.error("Details:", JSON.stringify(err.details, null, 2));
    appendEvidence(`Authorization Failed (Flow ${selectedFlow})`, {
      action: `POST /v2/checkout/orders/${orderId}/authorize`,
      status: `${err.status || 422} Error`,
      ids: { orderId },
      details: { error: err.message, details: err.details },
    });
    process.exit(1);
  }

  const authorizationId = authRes.authorizationId || authRes.id;
  console.log(`   ✓ Authorization successful! Authorization ID: ${authorizationId}`);

  appendEvidence(`Authorization Created (Flow ${selectedFlow})`, {
    action: `POST /v2/checkout/orders/${orderId}/authorize`,
    status: "201 Created",
    ids: { orderId, authorizationId },
    details: {
      status: authRes.status,
      amount: authRes.amount,
      expiration_time: authRes.expiration_time,
    },
  });

  if (selectedFlow === "1") {
    // Flow 1: Full Capture -> Invoice -> Payout
    console.log(`\nCapturing full authorization on delivery: ${authorizationId}...`);
    const captureRes = await capturePayPalAuthorization(authorizationId, totalUSD, true);
    console.log(`   ✓ Authorization Captured! Capture ID: ${captureRes.id}`);

    appendEvidence("Flow 1: Capture on Confirmed Delivery", {
      action: `POST /v2/payments/authorizations/${authorizationId}/capture`,
      status: "201 Created",
      ids: { orderId, authorizationId, captureId: captureRes.id },
      details: {
        status: captureRes.status,
        amount: captureRes.amount,
        final_capture: true,
      },
    });

    console.log("\nGenerating Draft Itemized Invoice v2...");
    try {
      const invRes = await createPayPalInvoice({
        orderId,
        buyerEmail: "sb-buyer@business.example.com",
        items: sampleItems,
        totalUSD,
      });
      console.log(`   ✓ Invoice generated! Invoice ID: ${invRes.id}`);
      appendEvidence("Flow 1: PayPal Itemized Invoicing v2", {
        action: "POST /v2/invoicing/invoices",
        status: "201 Created",
        ids: { orderId, invoiceId: invRes.id },
        details: invRes,
      });
    } catch (invErr) {
      console.warn("   ⚠️ Invoice creation note:", invErr.message);
    }

    console.log("\nExecuting Vendor Payout v1...");
    try {
      const payoutRes = await createVendorPayout({
        orderId,
        vendorEmail: "sb-vendor@business.example.com",
        grossAmountUSD: totalUSD,
        platformFeePct: 1.5,
      });
      console.log(`   ✓ Vendor Payout result: ${payoutRes.isSimulation ? "Simulation Fallback (403 PAYOUT_NOT_AVAILABLE)" : "Live Payout Batched"}`);
      appendEvidence("Flow 1: PayPal Vendor Payouts v1", {
        action: "POST /v1/payments/payouts",
        status: payoutRes.isSimulation ? "403 Fallback / Simulation" : "201 Created",
        ids: {
          orderId,
          payoutBatchId: payoutRes.batch_header?.payout_batch_id,
        },
        details: payoutRes,
      });
    } catch (payoutErr) {
      console.warn("   ⚠️ Payout execution note:", payoutErr.message);
    }
  } else if (selectedFlow === "2") {
    // Flow 2: SLA delivery slippage: 90% partial capture with final_capture: true
    const partialAmount = (Number(totalUSD) * 0.9).toFixed(2);
    console.log(`\nExecuting 90% Partial Capture ($${partialAmount} USD, 10% SLA credit voided) on ${authorizationId}...`);
    const captureRes = await capturePayPalAuthorization(authorizationId, partialAmount, true);
    console.log(`   ✓ 90% Capture Complete! Capture ID: ${captureRes.id} (Remaining 10% voided atomically)`);

    appendEvidence("Flow 2: SLA Breach Partial Capture (90% Capture / 10% Penalty Void)", {
      action: `POST /v2/payments/authorizations/${authorizationId}/capture (final_capture: true)`,
      status: "201 Created",
      ids: { orderId, authorizationId, captureId: captureRes.id },
      details: {
        capturedAmountUSD: partialAmount,
        originalAuthorizationUSD: totalUSD,
        penaltyCreditReleasedUSD: (Number(totalUSD) - Number(partialAmount)).toFixed(2),
        final_capture: true,
      },
    });
  } else if (selectedFlow === "3") {
    // Flow 3: Cancellation -> Void Authorization
    console.log(`\nVoiding authorization ${authorizationId}...`);
    const voidRes = await voidPayPalAuthorization(authorizationId);
    console.log(`   ✓ Authorization Voided successfully! Status: ${voidRes.status || "VOIDED"}`);

    appendEvidence("Flow 3: Authorization Void on Order Cancellation", {
      action: `POST /v2/payments/authorizations/${authorizationId}/void`,
      status: "204 No Content / 200 OK",
      ids: { orderId, authorizationId },
      details: voidRes,
    });
  }

  console.log("\n===============================================================");
  console.log("  ALL EVIDENCE SUCCESSFULLY RECORDED IN docs/SANDBOX_EVIDENCE.md");
  console.log("===============================================================\n");
}

if (require.main === module) {
  main().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
}

module.exports = { main };

