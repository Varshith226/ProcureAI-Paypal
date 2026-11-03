// client/src/api/paypalApi.js

const API_BASE = import.meta.env.VITE_API_BASE_URL || "";

async function request(path, options = {}) {
  const url = `${API_BASE}${path}`;
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };
  const res = await fetch(url, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(data.message || data.error || `Request failed with status ${res.status}`);
    error.status = res.status;
    error.details = data;
    throw error;
  }
  return data;
}

export async function fetchFxRate() {
  return request("/api/fx-rate");
}

export async function fetchAuditLog() {
  return request("/api/audit-log");
}

export async function fetchOrders(limit = 100) {
  return request(`/api/orders?limit=${limit}`);
}

export async function fetchOrderEvents(orderId) {
  return request(`/api/orders/${encodeURIComponent(orderId)}/events`);
}

export async function createMandate(payload) {
  return request("/api/mandates", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function verifyMandate(mandateId, tamperedPayload = null) {
  return request(`/api/mandates/${encodeURIComponent(mandateId)}/verify`, {
    method: "POST",
    body: JSON.stringify({ tamperedPayload }),
  });
}

export async function createOrder({
  planId,
  version,
  splitShareUSD,
  splitCount,
  intent = "AUTHORIZE",
  mandateId,
  isSimulation = false,
}) {
  return request("/api/paypal/create-order", {
    method: "POST",
    body: JSON.stringify({
      planId,
      version,
      splitShareUSD,
      splitCount,
      intent,
      mandateId,
      isSimulation,
    }),
  });
}

export async function authorizeOrder({ orderID, planId, mandateId, version, isSimulation = false }) {
  return request("/api/paypal/authorize-order", {
    method: "POST",
    body: JSON.stringify({ orderID, planId, mandateId, version, isSimulation }),
  });
}

export async function confirmDelivery(orderId, { slaPenaltyPct = 0, deliveryEvidence, vendorEmail } = {}) {
  return request(`/api/orders/${encodeURIComponent(orderId)}/confirm-delivery`, {
    method: "POST",
    body: JSON.stringify({ slaPenaltyPct, deliveryEvidence, vendorEmail }),
  });
}

export async function voidOrder(orderId) {
  return request(`/api/orders/${encodeURIComponent(orderId)}/void`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function createInvoice(orderId, { buyerEmail, items } = {}) {
  return request(`/api/orders/${encodeURIComponent(orderId)}/create-invoice`, {
    method: "POST",
    body: JSON.stringify({ buyerEmail, items }),
  });
}

export async function negotiateDiscount({ planId, items, currentTotalINR, targetDiscountINR, maxRounds }) {
  return request("/api/ai/negotiate", {
    method: "POST",
    body: JSON.stringify({ planId, items, currentTotalINR, targetDiscountINR, maxRounds }),
  });
}

export async function runAgentWorkflow({ prompt, budgetINR, maxDeliveryDays, minRefreshRateHz }) {
  return request("/api/ai/agent/run", {
    method: "POST",
    body: JSON.stringify({ prompt, budgetINR, maxDeliveryDays, minRefreshRateHz }),
  });
}

export async function compareQuote({ rawText, budgetINR }) {
  return request("/api/ai/compare-quote", {
    method: "POST",
    body: JSON.stringify({ rawText, budgetINR }),
  });
}

export async function simulateWebhook({ eventType, orderId, authorizationId, captureId, amountUSD, summary }) {
  return request("/api/paypal/webhook/simulate", {
    method: "POST",
    body: JSON.stringify({ eventType, orderId, authorizationId, captureId, amountUSD, summary }),
  });
}

export async function createApprovalTokenApi(mandateId, options = {}) {
  return request(`/api/mandates/${encodeURIComponent(mandateId)}/token`, {
    method: "POST",
    body: JSON.stringify(options),
  });
}

export async function validateApprovalTokenApi(token) {
  return request(`/api/mandates/token/${encodeURIComponent(token)}`);
}

export async function consumeApprovalTokenApi(token, options = {}) {
  return request(`/api/mandates/token/${encodeURIComponent(token)}/approve`, {
    method: "POST",
    body: JSON.stringify(options),
  });
}

