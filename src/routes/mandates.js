"use strict";

const express = require("express");
const {
  createSignedMandate,
  verifyMandateSignature,
  getMandateById,
  enforceMandate,
  getKeyFingerprint,
} = require("../mandateService");
const {
  createApprovalToken,
  validateApprovalToken,
  consumeApprovalToken,
  getApprovalRequired,
  setApprovalRequired,
  isMandateApproved,
} = require("../approvalService");

function createMandatesRouter() {
  const router = express.Router();

  // Governance config: check / toggle approval requirement
  router.get("/config/approval-required", (req, res) => {
    res.json({ approvalRequired: getApprovalRequired() });
  });

  router.post("/config/approval-required", (req, res) => {
    const { enabled, actor = "demo_user" } = req.body || {};
    const updated = setApprovalRequired(enabled, actor);
    res.json({ approvalRequired: updated, success: true });
  });

  // Check whether a mandate has been approved
  router.get("/:id/approval-status", (req, res) => {
    const mandate = getMandateById(req.params.id);
    if (!mandate) {
      return res.status(404).json({ error: "MANDATE_NOT_FOUND" });
    }
    const approved = isMandateApproved(mandate.mandateId, mandate.planVersion);
    res.json({
      mandateId: mandate.mandateId,
      approvalRequired: getApprovalRequired(),
      approved,
      status: approved ? "APPROVED" : "AWAITING_APPROVAL",
    });
  });

  // Create & sign a new spending mandate
  router.post("/", (req, res) => {
    try {
      const {
        mandateId,
        planId,
        planVersion,
        buyerId,
        approverId,
        items,
        currency,
        maxTotalINR,
        maxTotalUSD,
        fxRate,
        fxTimestamp,
        priceDriftTolerancePct,
        allowedMerchants,
        expiresInMinutes,
      } = req.body;

      if (!planId || maxTotalINR === undefined || maxTotalUSD === undefined) {
        return res.status(400).json({
          error: "INVALID_MANDATE_PAYLOAD",
          message: "planId, maxTotalINR, and maxTotalUSD are required",
        });
      }

      const mandate = createSignedMandate({
        mandateId,
        planId,
        planVersion: planVersion || 1,
        buyerId: buyerId || "buyer_corp_in",
        approverId: approverId || "founder_approval",
        items: items || [],
        currency: currency || "INR",
        maxTotalINR,
        maxTotalUSD,
        fxRate: fxRate || 0.0119,
        fxTimestamp: fxTimestamp || new Date().toISOString(),
        priceDriftTolerancePct: priceDriftTolerancePct !== undefined ? priceDriftTolerancePct : 0,
        allowedMerchants: allowedMerchants || ["*"],
        expiresInMinutes: expiresInMinutes || 10080,
      });

      res.status(201).json(mandate);
    } catch (err) {
      res.status(500).json({ error: "MANDATE_CREATION_FAILED", message: err.message });
    }
  });

  // Get mandate by ID
  router.get("/:id", (req, res) => {
    const mandate = getMandateById(req.params.id);
    if (!mandate) {
      return res.status(404).json({ error: "MANDATE_NOT_FOUND", message: `Mandate ${req.params.id} not found` });
    }
    res.json(mandate);
  });

  // Verify mandate signature (or test tampering)
  router.post("/:id/verify", (req, res) => {
    const mandate = getMandateById(req.params.id);
    if (!mandate) {
      return res.status(404).json({ error: "MANDATE_NOT_FOUND", message: `Mandate ${req.params.id} not found` });
    }

    const { tamperedPayload } = req.body || {};
    const payloadToVerify = tamperedPayload || {
      mandateId: mandate.mandateId,
      standard: mandate.standard,
      planId: mandate.planId,
      planVersion: mandate.planVersion,
      buyerId: mandate.buyerId,
      approverId: mandate.approverId,
      items: mandate.items,
      currency: mandate.currency,
      maxTotalINR: mandate.maxTotalINR,
      maxTotalUSD: mandate.maxTotalUSD,
      fxRate: mandate.fxRate,
      fxTimestamp: mandate.fxTimestamp,
      priceDriftTolerancePct: mandate.priceDriftTolerancePct,
      allowedMerchants: mandate.allowedMerchants,
      expiresAt: mandate.expiresAt,
      nonce: mandate.nonce,
      createdAt: mandate.createdAt,
    };

    const isValid = verifyMandateSignature(payloadToVerify, mandate.signature, mandate.publicKeyPem);

    res.json({
      mandateId: mandate.mandateId,
      valid: isValid,
      keyFingerprint: getKeyFingerprint(),
      algorithm: "Ed25519",
      standard: mandate.standard,
      isTampered: !isValid,
      message: isValid
        ? "Cryptographic signature is VALID. Mandate is intact and untampered."
        : "ALERT: Cryptographic signature mismatch! Mandate payload was altered.",
    });
  });

  // Test mandate enforcement check
  router.post("/:id/enforce", (req, res) => {
    const { planVersion, totalINR, totalUSD, merchantId, tamperedPayload } = req.body;
    const check = enforceMandate({
      mandateId: req.params.id,
      planVersion,
      totalINR,
      totalUSD,
      merchantId,
      tamperedPayload,
    });
    if (!check.allowed) {
      return res.status(422).json(check);
    }
    res.json(check);
  });

  // Generate single-use expiring approval token for mandate
  router.post("/:id/token", (req, res) => {
    const mandate = getMandateById(req.params.id);
    if (!mandate) {
      return res.status(404).json({ error: "MANDATE_NOT_FOUND", message: `Mandate ${req.params.id} not found` });
    }
    const { expiresInMinutes = 60, actor = "system" } = req.body || {};
    const tokenRecord = createApprovalToken({
      mandateId: mandate.mandateId,
      planVersion: mandate.planVersion,
      planId: mandate.planId,
      expiresInMinutes,
      actor,
    });
    res.status(201).json(tokenRecord);
  });

  // Validate approval token
  router.get("/token/:token", (req, res) => {
    const validation = validateApprovalToken(req.params.token);
    if (!validation.valid) {
      return res.status(400).json(validation);
    }
    const mandate = getMandateById(validation.tokenRecord.mandateId);
    res.json({
      valid: true,
      tokenRecord: validation.tokenRecord,
      mandate,
    });
  });

  // Consume single-use approval token to approve mandate
  router.post("/token/:token/approve", (req, res) => {
    const { approverId, planVersion, mandateId } = req.body || {};
    const result = consumeApprovalToken(req.params.token, {
      mandateId,
      planVersion,
      approverId: approverId || "executive_founder",
    });
    if (!result.valid) {
      return res.status(400).json(result);
    }

    try {
      const { broadcastEvent } = require("../sseService");
      broadcastEvent("MANDATE_APPROVED", {
        mandateId: result.mandateId,
        planVersion: result.planVersion,
        approverId: result.approverId,
        consumedAt: result.consumedAt,
        token: req.params.token,
      });
    } catch (_) {}

    res.json(result);
  });

  return router;
}

module.exports = { createMandatesRouter };

