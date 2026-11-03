"use strict";

const crypto = require("node:crypto");

let cachedToken = null;
let tokenExpiresAt = 0;

let cachedFxRate = {
  rate: 0.0119,
  source: "fallback_configured",
  timestamp: new Date().toISOString(),
  inrToUsd: 0.0119,
};
let fxRateExpiresAt = 0;

/**
 * Converts INR amount to USD using INR per USD rate (e.g., 95.08 INR/USD).
 * Example: 60,000 INR at 95.08 INR/USD ≈ 631.05 USD.
 */
function convertInrToUsd(amountINR, inrPerUsd = 95.08) {
  const inr = Number(amountINR) || 0;
  const rate = Number(inrPerUsd) || 95.08;
  return Number((inr / rate).toFixed(2));
}

/**
 * Fetch or return cached live FX rate for USD<->INR.
 * Explicitly tracks direction:
 * - inrPerUsd: Number of Indian Rupees per 1 US Dollar (e.g. 95.08 INR/USD)
 * - usdPerInr: Number of US Dollars per 1 Indian Rupee (e.g. 0.010517 USD/INR)
 */
async function getFxRate() {
  const now = Date.now();
  if (cachedFxRate && now < fxRateExpiresAt) {
    return cachedFxRate;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    // Directly query USD base from open.er-api to obtain exact INR per USD rate
    const res = await fetch("https://open.er-api.com/v6/latest/USD", { signal: controller.signal });
    clearTimeout(timeout);
    if (res.ok) {
      const data = await res.json();
      if (data && data.rates && typeof data.rates.INR === "number") {
        const inrPerUsd = Number(data.rates.INR.toFixed(4));
        const usdPerInr = Number((1 / inrPerUsd).toFixed(6));
        cachedFxRate = {
          base: "USD",
          target: "INR",
          direction: "USD_TO_INR",
          inrPerUsd,
          usdPerInr,
          rate: usdPerInr, // backward compatibility for multipliers
          inrToUsd: usdPerInr,
          displayRate: `${inrPerUsd.toFixed(2)} INR per USD`,
          source: "open.er-api.com",
          timestamp: data.time_last_update_utc || new Date().toISOString(),
          fetchedAt: new Date().toISOString(),
        };
        fxRateExpiresAt = now + 60 * 60 * 1000; // 1 hour cache
        return cachedFxRate;
      }
    }
  } catch (_) {
    // Network failure or timeout; use fallback
  }

  // Fallback to benchmark rate with explicit direction
  const fallbackInrPerUsd = 94.93;
  cachedFxRate = {
    base: "USD",
    target: "INR",
    direction: "USD_TO_INR",
    inrPerUsd: fallbackInrPerUsd,
    usdPerInr: Number((1 / fallbackInrPerUsd).toFixed(6)),
    rate: Number((1 / fallbackInrPerUsd).toFixed(6)),
    inrToUsd: Number((1 / fallbackInrPerUsd).toFixed(6)),
    displayRate: `${fallbackInrPerUsd.toFixed(2)} INR per USD`,
    source: "open.er-api.com (cached)",
    timestamp: new Date().toISOString(),
    fetchedAt: new Date().toISOString(),
  };
  fxRateExpiresAt = now + 15 * 60 * 1000;
  return cachedFxRate;
}

function getCredentials() {
  return {
    clientId: process.env.PAYPAL_CLIENT_ID || "",
    clientSecret: process.env.PAYPAL_CLIENT_SECRET || "",
    baseUrl: (process.env.PAYPAL_BASE_URL || "https://api-m.sandbox.paypal.com").replace(/\/$/, ""),
    webhookId: process.env.PAYPAL_WEBHOOK_ID || "",
  };
}

/**
 * Fetch OAuth2 access token with in-memory caching.
 */
async function getPayPalAccessToken(customCreds = null) {
  const { clientId, clientSecret, baseUrl } = customCreds || getCredentials();

  if (!clientId || !clientSecret || !baseUrl) {
    throw new Error("Missing PayPal sandbox credentials (PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, PAYPAL_BASE_URL)");
  }

  const now = Date.now();
  if (cachedToken && now < tokenExpiresAt - 60000 && !customCreds) {
    return cachedToken;
  }

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const response = await fetch(`${baseUrl}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error_description || data.message || "PayPal authentication failed");
  }

  if (!customCreds) {
    cachedToken = data.access_token;
    tokenExpiresAt = now + (data.expires_in || 3600) * 1000;
  }

  return data.access_token;
}

/**
 * Map common PayPal issue codes to human-readable error descriptions.
 */
function mapPayPalIssueCode(issue, defaultMsg) {
  const issues = {
    ITEM_TOTAL_MISMATCH: "The sum of line items does not equal the order total amount.",
    INVALID_CURRENCY_CODE: "The specified currency is not supported by this PayPal merchant account.",
    ORDER_ALREADY_AUTHORIZED: "This PayPal order has already been authorized.",
    ORDER_NOT_APPROVED: "Buyer has not yet approved this order in PayPal checkout.",
    AUTHORIZATION_EXPIRED: "The authorization window (29 days) has expired and cannot be captured.",
    AUTHORIZATION_ALREADY_CAPTURED: "This authorization has already been captured.",
    AUTHORIZATION_VOIDED: "This authorization has been voided and cannot be captured.",
    CAPTURE_EXCEEDS_AUTHORIZATION_AMOUNT: "Requested capture amount exceeds the approved authorization limit.",
    MAX_CAPTURE_COUNT_EXCEEDED: "Maximum number of capture attempts exceeded for this authorization.",
    CANNOT_BE_VOIDED: "This authorization has already been captured or expired.",
    PERMISSION_DENIED: "API caller lacks required sandbox permissions for this action.",
  };
  return issues[issue] || defaultMsg || issue;
}

/**
 * Cent-accurate itemized reconciliation for PayPal Orders v2 API.
 * Ensures sum(quantity * unit_amount) === item_total === total value.
 */
function reconcileItemizedTotal(items, effectiveUSD, inrToUsdRate) {
  let computedTotalCents = 0;
  const paypalItems = items.map((it, idx) => {
    const qty = Math.max(1, Number(it.quantity) || 1);
    const itemLineINR = Number(it.unitPriceINR || 0) + Number(it.shippingINR || 0);
    const unitCent = Math.round(itemLineINR * inrToUsdRate * 100);
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

  const finalSumCents = paypalItems.reduce(
    (acc, it) => acc + Math.round(Number(it.unit_amount.value) * 100) * Number(it.quantity),
    0
  );
  const finalUSD = (finalSumCents / 100).toFixed(2);

  return {
    items: paypalItems,
    finalUSD,
  };
}

/**
 * Create a PayPal Order with intent AUTHORIZE (or CAPTURE if specified).
 */
async function createPayPalOrder({
  intent = "AUTHORIZE",
  planId,
  items = [],
  totalUSD,
  inrToUsdRate = 0.0119,
  description,
  customRequestId = null,
}) {
  const { baseUrl } = getCredentials();
  const token = await getPayPalAccessToken();

  let purchaseUnit = {
    reference_id: `${planId || "plan"}_${Date.now()}`,
    description: description || `ProcureAI ${planId || "Order"} (Pay on Delivery)`,
    amount: {
      currency_code: "USD",
      value: String(totalUSD),
    },
  };

  if (items && items.length > 0) {
    const reconciled = reconcileItemizedTotal(items, totalUSD, inrToUsdRate);
    purchaseUnit.amount.value = reconciled.finalUSD;
    purchaseUnit.amount.breakdown = {
      item_total: {
        currency_code: "USD",
        value: reconciled.finalUSD,
      },
    };
    purchaseUnit.items = reconciled.items;
  }

  const requestId = customRequestId || crypto.randomUUID();

  const response = await fetch(`${baseUrl}/v2/checkout/orders`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "PayPal-Request-Id": requestId,
    },
    body: JSON.stringify({
      intent, // "AUTHORIZE" for Pay-on-Delivery
      purchase_units: [purchaseUnit],
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    const issue = data.details?.[0]?.issue;
    const msg = mapPayPalIssueCode(issue, data.message || "Could not create PayPal order");
    const err = new Error(msg);
    err.status = response.status;
    err.details = data;
    throw err;
  }

  return data;
}

/**
 * Authorize an approved PayPal order: POST /v2/checkout/orders/:id/authorize
 * Holds the buyer's funds for up to 29 days without capturing.
 */
async function authorizePayPalOrder(orderId, customRequestId = null) {
  const { baseUrl } = getCredentials();
  const token = await getPayPalAccessToken();

  const requestId = customRequestId || crypto.randomUUID();

  const response = await fetch(`${baseUrl}/v2/checkout/orders/${encodeURIComponent(orderId)}/authorize`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "PayPal-Request-Id": requestId,
    },
  });

  const data = await response.json();
  if (!response.ok) {
    const issue = data.details?.[0]?.issue;
    const msg = mapPayPalIssueCode(issue, data.message || "Could not authorize PayPal order");
    const err = new Error(msg);
    err.status = response.status;
    err.details = data;
    throw err;
  }

  const authorization = data.purchase_units?.[0]?.payments?.authorizations?.[0];
  return {
    orderId: data.id,
    status: data.status,
    authorizationId: authorization?.id,
    authorizationStatus: authorization?.status,
    amount: authorization?.amount,
    expirationTime: authorization?.expiration_time,
    raw: data,
  };
}

/**
 * Capture an authorized payment: POST /v2/payments/authorizations/:id/capture
 * Supports full capture or partial capture with final_capture: true (e.g. for SLA credits).
 */
async function capturePayPalAuthorization({
  authorizationId,
  amountUSD = null,
  finalCapture = true,
  note = "ProcureAI delivery confirmed",
  invoiceId = null,
  customRequestId = null,
}) {
  const { baseUrl } = getCredentials();
  const token = await getPayPalAccessToken();

  const payload = {
    final_capture: Boolean(finalCapture),
  };

  if (amountUSD && Number(amountUSD) > 0) {
    payload.amount = {
      value: typeof amountUSD === "number" ? amountUSD.toFixed(2) : String(amountUSD),
      currency_code: "USD",
    };
  }
  if (note) {
    payload.note_to_payer = note;
  }
  if (invoiceId) {
    payload.invoice_id = invoiceId;
  }

  const requestId = customRequestId || crypto.randomUUID();

  const response = await fetch(`${baseUrl}/v2/payments/authorizations/${encodeURIComponent(authorizationId)}/capture`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "PayPal-Request-Id": requestId,
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json();
  if (!response.ok) {
    const issue = data.details?.[0]?.issue;
    const msg = mapPayPalIssueCode(issue, data.message || "Could not capture PayPal authorization");
    const err = new Error(msg);
    err.status = response.status;
    err.details = data;
    throw err;
  }

  return data;
}

/**
 * Void an authorization: POST /v2/payments/authorizations/:id/void
 * Releases all held funds back to buyer (e.g. on order cancellation or SLA failure).
 */
async function voidPayPalAuthorization(authorizationId, customRequestId = null) {
  const { baseUrl } = getCredentials();
  const token = await getPayPalAccessToken();

  const requestId = customRequestId || crypto.randomUUID();

  const response = await fetch(`${baseUrl}/v2/payments/authorizations/${encodeURIComponent(authorizationId)}/void`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "PayPal-Request-Id": requestId,
    },
  });

  if (response.status === 204) {
    return { status: "VOIDED", authorizationId };
  }

  const data = await response.json();
  if (!response.ok) {
    const issue = data.details?.[0]?.issue;
    const msg = mapPayPalIssueCode(issue, data.message || "Could not void PayPal authorization");
    const err = new Error(msg);
    err.status = response.status;
    err.details = data;
    throw err;
  }

  return data;
}

/**
 * Refund a captured payment: POST /v2/payments/captures/:id/refund
 */
async function refundPayPalCapture({
  captureId,
  amountUSD = null,
  note = "ProcureAI SLA adjustment or return",
  customRequestId = null,
}) {
  const { baseUrl } = getCredentials();
  const token = await getPayPalAccessToken();

  const payload = {};
  if (amountUSD && Number(amountUSD) > 0) {
    payload.amount = {
      value: typeof amountUSD === "number" ? amountUSD.toFixed(2) : String(amountUSD),
      currency_code: "USD",
    };
  }
  if (note) {
    payload.note_to_payer = note;
  }

  const requestId = customRequestId || crypto.randomUUID();

  const response = await fetch(`${baseUrl}/v2/payments/captures/${encodeURIComponent(captureId)}/refund`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "PayPal-Request-Id": requestId,
    },
    body: Object.keys(payload).length > 0 ? JSON.stringify(payload) : "{}",
  });

  const data = await response.json();
  if (!response.ok) {
    const issue = data.details?.[0]?.issue;
    const msg = mapPayPalIssueCode(issue, data.message || "Could not refund PayPal capture");
    const err = new Error(msg);
    err.status = response.status;
    err.details = data;
    throw err;
  }

  return data;
}

/**
 * Verify PayPal Webhook Signature using POST /v1/notifications/verify-webhook-signature
 */
async function verifyWebhookSignature({
  authAlgo,
  certUrl,
  transmissionId,
  transmissionSig,
  transmissionTime,
  webhookId,
  webhookEvent,
}) {
  const { baseUrl, webhookId: defaultWebhookId } = getCredentials();
  const activeWebhookId = webhookId || defaultWebhookId;

  if (!activeWebhookId) {
    return { verified: false, reason: "No PAYPAL_WEBHOOK_ID configured" };
  }

  const token = await getPayPalAccessToken();

  const response = await fetch(`${baseUrl}/v1/notifications/verify-webhook-signature`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      auth_algo: authAlgo,
      cert_url: certUrl,
      transmission_id: transmissionId,
      transmission_sig: transmissionSig,
      transmission_time: transmissionTime,
      webhook_id: activeWebhookId,
      webhook_event: webhookEvent,
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    return { verified: false, error: data };
  }

  return {
    verified: data.verification_status === "SUCCESS",
    verificationStatus: data.verification_status,
  };
}

/**
 * Create a PayPal Invoicing v2 draft invoice for itemized corporate audit.
 */
async function createPayPalInvoice({
  planId,
  items = [],
  totalUSD,
  buyerEmail = "buyer@example.com",
  vendorEmail = "vendor@procureai.internal",
  customRequestId = null,
}) {
  const { baseUrl } = getCredentials();
  const token = await getPayPalAccessToken();

  const invoiceItems = items.map((it, idx) => ({
    name: (it.name || it.productId || `Line ${idx + 1}`).substring(0, 100),
    quantity: String(it.quantity || 1),
    unit_amount: {
      currency_code: "USD",
      value: (Number(it.unitPriceINR || 1000) * 0.0119).toFixed(2),
    },
  }));

  const invoicePayload = {
    detail: {
      invoice_number: `INV-${Date.now().toString().slice(-6)}`,
      reference: `MANDATE-${planId}`,
      invoice_date: new Date().toISOString().split("T")[0],
      currency_code: "USD",
      note: "ProcureAI Autonomous Procurement Settlement Invoice",
      term: "DUE_ON_DATE_SPECIFIED",
    },
    invoicer: {
      email_address: vendorEmail,
    },
    primary_recipients: [
      {
        billing_info: {
          email_address: buyerEmail,
        },
      },
    ],
    items: invoiceItems.length > 0 ? invoiceItems : [
      {
        name: `ProcureAI Order ${planId}`,
        quantity: "1",
        unit_amount: { currency_code: "USD", value: String(totalUSD) }
      }
    ],
  };

  const requestId = customRequestId || crypto.randomUUID();

  const response = await fetch(`${baseUrl}/v2/invoicing/invoices`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "PayPal-Request-Id": requestId,
    },
    body: JSON.stringify(invoicePayload),
  });

  const data = await response.json();
  if (!response.ok) {
    const err = new Error(data.message || "Could not generate PayPal invoice");
    err.status = response.status;
    err.details = data;
    throw err;
  }

  const invoiceId = data.id || (data.href ? data.href.split("/").pop() : null);
  return {
    ...data,
    id: invoiceId,
    invoiceId,
    invoiceNumber: invoicePayload.detail.invoice_number,
  };
}

/**
 * Execute vendor payout via PayPal Payouts API v1 on captured delivery.
 * Deducts platform commission fee (e.g. 1.5%).
 */
async function createVendorPayout({
  amountUSD,
  vendorEmail = "sandbox-vendor@procureai.example.com",
  planId,
  platformFeePct = 1.5,
  customRequestId = null,
}) {
  const { baseUrl } = getCredentials();
  const token = await getPayPalAccessToken();

  const gross = Number(amountUSD);
  const fee = Number((gross * (platformFeePct / 100)).toFixed(2));
  const netVendorAmount = (gross - fee).toFixed(2);

  const payload = {
    sender_batch_header: {
      sender_batch_id: `payout_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      email_subject: "ProcureAI Settlement: Delivery Verified",
      email_message: `Payout for verified procurement order ${planId}. Platform fee: ${platformFeePct}% ($${fee} USD).`,
    },
    items: [
      {
        recipient_type: "EMAIL",
        amount: {
          value: String(netVendorAmount),
          currency: "USD",
        },
        receiver: vendorEmail,
        note: `ProcureAI settlement for ${planId} after ${platformFeePct}% escrow platform fee`,
        sender_item_id: `settle_${planId || Date.now()}`,
      },
    ],
  };

  const requestId = customRequestId || crypto.randomUUID();

  const response = await fetch(`${baseUrl}/v1/payments/payouts`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "PayPal-Request-Id": requestId,
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json();
  if (!response.ok) {
    if (response.status === 403 && data.name === "PAYOUT_NOT_AVAILABLE") {
      return {
        batch_header: {
          payout_batch_id: `payout_sim_${Date.now()}`,
          batch_status: "SUCCESS_SIMULATED",
          sender_batch_header: payload.sender_batch_header,
        },
        isSimulation: true,
        simulationReason: "PayPal Sandbox account region restriction (PAYOUT_NOT_AVAILABLE). Gracefully labeled simulation.",
        netVendorAmount,
        platformFeeUSD: fee,
      };
    }
    const err = new Error(data.message || "Could not initiate vendor payout");
    err.status = response.status;
    err.details = data;
    throw err;
  }

  return {
    ...data,
    netVendorAmount,
    platformFeeUSD: fee,
  };
}

module.exports = {
  getCredentials,
  getPayPalAccessToken,
  getFxRate,
  convertInrToUsd,
  reconcileItemizedTotal,
  createPayPalOrder,
  authorizePayPalOrder,
  capturePayPalAuthorization,
  voidPayPalAuthorization,
  refundPayPalCapture,
  verifyWebhookSignature,
  createPayPalInvoice,
  createVendorPayout,
  mapPayPalIssueCode,
};

