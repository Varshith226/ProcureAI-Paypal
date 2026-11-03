"use strict";

const express = require("express");
const {
  getOrder,
  listOrders,
  updateOrderStatus,
  listOrderEvents,
  recordOrderEvent,
} = require("../orderService");
const {
  capturePayPalAuthorization,
  voidPayPalAuthorization,
  createPayPalInvoice,
  createVendorPayout,
} = require("../paypalService");

function createOrdersRouter() {
  const router = express.Router();

  // List all orders (for AG Grid Orders Ledger)
  router.get("/", (req, res) => {
    const orders = listOrders(Number(req.query.limit) || 100);
    res.json(orders);
  });

  // Get order by ID with event history
  router.get("/:id", (req, res) => {
    const order = getOrder(req.params.id);
    if (!order) {
      return res.status(404).json({ error: "ORDER_NOT_FOUND", message: `Order ${req.params.id} not found` });
    }
    const events = listOrderEvents(req.params.id);
    res.json({
      ...order,
      events,
    });
  });

  // Get event timeline for order
  router.get("/:id/events", (req, res) => {
    const events = listOrderEvents(req.params.id);
    res.json(events);
  });

  // Confirm delivery -> Captures held authorization in PayPal (Pay-on-Delivery)
  // Supports SLA credit: e.g. 10% SLA credit captures 90% and voids 10% automatically via final_capture: true
  router.post("/:id/confirm-delivery", async (req, res) => {
    const order = getOrder(req.params.id);
    if (!order) {
      return res.status(404).json({ error: "ORDER_NOT_FOUND", message: `Order ${req.params.id} not found` });
    }

    if (!order.authorization_id) {
      return res.status(400).json({
        error: "NO_ACTIVE_AUTHORIZATION",
        message: "Order does not have an active PayPal authorization to capture.",
      });
    }

    try {
      const { slaPenaltyPct = 0, deliveryEvidence, vendorEmail } = req.body;
      const penalty = Math.min(100, Math.max(0, Number(slaPenaltyPct) || 0));

      let captureAmountUSD = Number(order.total_usd || 0);
      let isPartialCapture = false;

      if (penalty > 0) {
        // SLA breach credit: capture (100 - penalty)% and release the rest!
        captureAmountUSD = Number((captureAmountUSD * ((100 - penalty) / 100)).toFixed(2));
        isPartialCapture = true;
      }

      recordOrderEvent(order.order_id, "DELIVERY_CONFIRMED", {
        deliveryEvidence: deliveryEvidence || "Recipient courier receipt signed",
        slaPenaltyPct: penalty,
        capturedUSD: captureAmountUSD,
      });

      // Execute capture against PayPal sandbox authorization
      let captureResult = null;
      try {
        captureResult = await capturePayPalAuthorization({
          authorizationId: order.authorization_id,
          amountUSD: isPartialCapture ? captureAmountUSD : null,
          finalCapture: true, // Auto-voids remainder if partial!
          note: penalty > 0
            ? `ProcureAI Delivery Confirmed with ${penalty}% SLA Credit. Remainder voided.`
            : "ProcureAI Delivery Verified. Pay-on-Delivery Authorization Hold Captured.",
        });
      } catch (paypalErr) {
        // If PayPal sandbox credentials are empty or fail, support mock fallback for demo stability
        if (!process.env.PAYPAL_CLIENT_ID) {
          captureResult = {
            id: `CAP-SIM-${Date.now()}`,
            status: "COMPLETED",
            amount: { value: String(captureAmountUSD), currency_code: "USD" },
          };
        } else {
          throw paypalErr;
        }
      }

      const captureId = captureResult?.id || captureResult?.purchase_units?.[0]?.payments?.captures?.[0]?.id;
      const newStatus = isPartialCapture ? "PARTIALLY_CAPTURED" : "CAPTURED";

      const updated = updateOrderStatus(order.order_id, newStatus, {
        captureId,
      });

      // Automatically trigger vendor payout (minus platform fee)
      let payoutResult = null;
      try {
        payoutResult = await createVendorPayout({
          amountUSD: captureAmountUSD,
          vendorEmail: vendorEmail || "sandbox-vendor@procureai.example.com",
          planId: order.plan_id,
          platformFeePct: 1.5,
        });

        updateOrderStatus(order.order_id, "VENDOR_PAID", {
          payoutBatchId: payoutResult.sender_batch_header?.payout_batch_id || payoutResult.batch_header?.payout_batch_id,
        });
      } catch (payoutErr) {
        // Vendor payout can fail in sandbox without blocking delivery confirmation
        recordOrderEvent(order.order_id, "PAYOUT_DEFERRED", { error: payoutErr.message });
      }

      res.json({
        status: newStatus,
        orderId: order.order_id,
        authorizationId: order.authorization_id,
        captureId,
        capturedAmountUSD: captureAmountUSD,
        slaCreditAppliedPct: penalty,
        vendorPayout: payoutResult,
        capturedAtISO: new Date().toISOString(),
      });
    } catch (err) {
      res.status(502).json({ error: "CAPTURE_FAILED", message: err.message, details: err.details });
    }
  });

  // Void authorization (e.g. cancelled order or total SLA breach)
  router.post("/:id/void", async (req, res) => {
    const order = getOrder(req.params.id);
    if (!order) {
      return res.status(404).json({ error: "ORDER_NOT_FOUND", message: `Order ${req.params.id} not found` });
    }

    if (!order.authorization_id) {
      return res.status(400).json({
        error: "NO_ACTIVE_AUTHORIZATION",
        message: "Order does not have an active PayPal authorization to void.",
      });
    }

    try {
      let voidResult = null;
      try {
        voidResult = await voidPayPalAuthorization(order.authorization_id);
      } catch (paypalErr) {
        if (!process.env.PAYPAL_CLIENT_ID) {
          voidResult = { status: "VOIDED", authorizationId: order.authorization_id };
        } else {
          throw paypalErr;
        }
      }

      const updated = updateOrderStatus(order.order_id, "VOIDED", {
        voidId: order.authorization_id,
      });

      res.json({
        status: "VOIDED",
        orderId: order.order_id,
        authorizationId: order.authorization_id,
        voidedAtISO: new Date().toISOString(),
      });
    } catch (err) {
      res.status(502).json({ error: "VOID_FAILED", message: err.message });
    }
  });

  // Generate an official PayPal Invoice v2
  router.post("/:id/create-invoice", async (req, res) => {
    const order = getOrder(req.params.id);
    if (!order) {
      return res.status(404).json({ error: "ORDER_NOT_FOUND", message: `Order ${req.params.id} not found` });
    }

    try {
      const { buyerEmail, items } = req.body;
      let invoiceData = null;

      try {
        invoiceData = await createPayPalInvoice({
          planId: order.plan_id || order.order_id,
          totalUSD: order.total_usd,
          buyerEmail: buyerEmail || "buyer@example.com",
          items: items || [],
        });
      } catch (paypalErr) {
        if (!process.env.PAYPAL_CLIENT_ID) {
          invoiceData = {
            id: `INV-SIM-${Date.now()}`,
            status: "DRAFT",
            href: `https://www.sandbox.paypal.com/invoice/viewer/INV-SIM-${Date.now()}`,
          };
        } else {
          throw paypalErr;
        }
      }

      updateOrderStatus(order.order_id, order.status, {
        invoiceId: invoiceData.id,
      });

      res.json({
        invoiceId: invoiceData.id,
        status: invoiceData.status || "DRAFT",
        invoiceUrl: invoiceData.href || `https://www.sandbox.paypal.com/invoice/viewer/${invoiceData.id}`,
        raw: invoiceData,
      });
    } catch (err) {
      res.status(502).json({ error: "INVOICE_FAILED", message: err.message });
    }
  });

  return router;
}

module.exports = { createOrdersRouter };

