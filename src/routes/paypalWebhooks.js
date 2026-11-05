"use strict";

const express = require("express");
const { verifyWebhookSignature } = require("../paypalService");
const { recordWebhookEvent, listWebhookEvents, updateOrderStatus, getOrder } = require("../orderService");

function createWebhooksRouter() {
  const router = express.Router();

  // List recent webhook events
  router.get("/", (req, res) => {
    const events = listWebhookEvents(50);
    res.json(events);
  });

  // Live PayPal Webhook Listener
  router.post("/", async (req, res) => {
    try {
      const webhookEvent = req.body;
      if (!webhookEvent || !webhookEvent.event_type) {
        return res.status(400).json({ error: "Invalid webhook payload" });
      }

      const authAlgo = req.headers["paypal-auth-algo"];
      const certUrl = req.headers["paypal-cert-url"];
      const transmissionId = req.headers["paypal-transmission-id"];
      const transmissionSig = req.headers["paypal-transmission-sig"];
      const transmissionTime = req.headers["paypal-transmission-time"];

      // If incoming from live PayPal webhook delivery, require PAYPAL_WEBHOOK_ID and cryptographic verification
      if (transmissionSig || certUrl || authAlgo) {
        if (!process.env.PAYPAL_WEBHOOK_ID) {
          console.warn("⚠️ Live PayPal webhook received but PAYPAL_WEBHOOK_ID is not configured. Rejecting unverified webhook.");
          return res.status(401).json({
            error: "WEBHOOK_UNCONFIGURED",
            message: "Live webhook signature verification requires PAYPAL_WEBHOOK_ID. Unverified public webhooks are rejected.",
          });
        }

        const verification = await verifyWebhookSignature({
          authAlgo,
          certUrl,
          transmissionId,
          transmissionSig,
          transmissionTime,
          webhookEvent,
        });

        if (!verification.verified) {
          console.warn("❌ PayPal Webhook signature verification rejected:", verification);
          return res.status(400).json({ error: "Webhook signature verification failed" });
        }
      } else if (process.env.NODE_ENV === "production" && !process.env.ALLOW_INSECURE_WEBHOOKS) {
        return res.status(401).json({
          error: "UNVERIFIED_WEBHOOK",
          message: "Live webhooks in production require PayPal transmission signature headers.",
        });
      }

      const eventId = webhookEvent.id || `wh_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const eventType = webhookEvent.event_type;
      const summary = webhookEvent.summary || `PayPal event ${eventType}`;

      // Idempotent record
      const result = recordWebhookEvent({
        eventId,
        eventType,
        summary,
        payload: webhookEvent,
        isSimulation: false,
      });

      if (result.alreadyProcessed) {
        return res.status(200).json({ status: "ALREADY_PROCESSED", eventId });
      }

      // Map event to internal order state
      handleWebhookStateTransition(eventType, webhookEvent);

      res.status(200).json({ status: "PROCESSED", eventId });
    } catch (err) {
      console.error("Webhook processing error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // Simulated Webhook Trigger (for reliable local & hackathon judge demos without public tunneling)
  router.post("/simulate", (req, res) => {
    try {
      const {
        eventType = "PAYMENT.CAPTURE.COMPLETED",
        orderId,
        authorizationId,
        captureId,
        amountUSD = "595.00",
        summary,
      } = req.body;

      const eventId = `sim_evt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const simulatedPayload = {
        id: eventId,
        event_version: "1.0",
        create_time: new Date().toISOString(),
        resource_type: eventType.includes("AUTHORIZATION") ? "authorization" : "capture",
        event_type: eventType,
        summary: summary || `[SIMULATION] PayPal Webhook: ${eventType}`,
        resource: {
          id: captureId || authorizationId || `SIM-${Date.now()}`,
          status: "COMPLETED",
          amount: { currency_code: "USD", value: String(amountUSD) },
          custom_id: orderId || undefined,
        },
      };

      recordWebhookEvent({
        eventId,
        eventType,
        summary: `[SIMULATED] ${eventType}`,
        payload: simulatedPayload,
        isSimulation: true,
      });

      if (orderId) {
        handleWebhookStateTransition(eventType, simulatedPayload, orderId);
      }

      res.status(200).json({
        status: "SIMULATED_WEBHOOK_PROCESSED",
        eventId,
        eventType,
        isSimulation: true,
        orderId,
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}

function handleWebhookStateTransition(eventType, payload, explicitOrderId = null) {
  const resource = payload.resource || {};
  const orderId = explicitOrderId || resource.custom_id || resource.supplementary_data?.related_ids?.order_id;

  if (!orderId) return;

  const existingOrder = getOrder(orderId);
  if (!existingOrder) return;

  switch (eventType) {
    case "CHECKOUT.ORDER.APPROVED":
      updateOrderStatus(orderId, "APPROVED", {
        details: "Buyer approved checkout in PayPal sandbox",
      });
      break;

    case "PAYMENT.AUTHORIZATION.CREATED":
      updateOrderStatus(orderId, "AUTHORIZED", {
        authorizationId: resource.id,
        authorizationExpiresAt: resource.expiration_time,
      });
      break;

    case "PAYMENT.AUTHORIZATION.VOIDED":
      updateOrderStatus(orderId, "VOIDED", {
        voidId: resource.id,
      });
      break;

    case "PAYMENT.CAPTURE.COMPLETED":
      updateOrderStatus(orderId, "CAPTURED", {
        captureId: resource.id,
      });
      break;

    case "PAYMENT.CAPTURE.REFUNDED":
      updateOrderStatus(orderId, "REFUNDED", {
        refundId: resource.id,
      });
      break;

    case "PAYMENT.CAPTURE.DENIED":
      updateOrderStatus(orderId, "DENIED", {
        denialReason: resource.status_details?.reason,
      });
      break;

    case "PAYMENT.PAYOUTSBATCH.SUCCESS":
      updateOrderStatus(orderId, "VENDOR_PAID", {
        payoutBatchId: resource.batch_header?.payout_batch_id,
      });
      break;

    default:
      break;
  }
}

module.exports = { createWebhooksRouter, handleWebhookStateTransition };

