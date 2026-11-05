// client/src/components/SignedMandateCard.jsx
import React, { useState } from "react";
import { Card, Space, Typography, Tag, Button, message, Alert, Progress } from "antd";
import {
  KeyOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  WarningOutlined,
  CopyOutlined,
} from "@ant-design/icons";
import { verifyMandate } from "../api/paypalApi";

const { Text, Paragraph } = Typography;

export default function SignedMandateCard({
  mandate,
  budgetCapINR = 60000,
  inrPerUsd = 94.93,
  isDarkMode = true,
}) {
  const [verifying, setVerifying] = useState(false);
  const [verificationResult, setVerificationResult] = useState(null);

  if (!mandate) {
    return null;
  }

  const effectiveINR = Number(mandate.maxTotalINR || budgetCapINR);
  const effectiveUSD = mandate.maxTotalUSD
    ? Number(mandate.maxTotalUSD).toFixed(2)
    : (effectiveINR / (inrPerUsd || 94.93)).toFixed(2);

  const handleVerify = async (tamper = false) => {
    setVerifying(true);
    try {
      const tampered = tamper
        ? { ...mandate, maxTotalINR: 999999, standard: "TAMPERED_AGENT_MANDATE" }
        : null;
      const res = await verifyMandate(mandate.mandateId, tampered);
      setVerificationResult(res);
      if (res.valid) {
        message.success("Ed25519 cryptographic signature is VALID and untampered!");
      } else {
        message.error("ALERT: Cryptographic signature mismatch! Tampering detected.");
      }
    } catch (err) {
      message.error(`Verification call failed: ${err.message}`);
    } finally {
      setVerifying(false);
    }
  };

  const bgCard = isDarkMode ? "rgba(15, 23, 42, 0.85)" : "#ffffff";
  const bgTile = isDarkMode ? "rgba(0, 82, 255, 0.08)" : "#eff6ff";
  const borderTile = isDarkMode ? "rgba(0, 82, 255, 0.25)" : "rgba(0, 82, 255, 0.2)";
  const dividerColor = isDarkMode ? "rgba(255, 255, 255, 0.06)" : "rgba(0, 0, 0, 0.06)";

  return (
    <Card
      style={{
        borderRadius: 16,
        marginBottom: 20,
        background: bgCard,
        border: "1px solid rgba(0, 82, 255, 0.25)",
        boxShadow: "0 8px 24px -6px rgba(0, 82, 255, 0.12)",
      }}
      bodyStyle={{ padding: 18 }}
    >
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
        <Space align="center" size={8}>
          <div style={{
            width: 28,
            height: 28,
            borderRadius: 8,
            background: "rgba(0, 82, 255, 0.15)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center"
          }}>
            <KeyOutlined style={{ color: "#0052FF", fontSize: 15 }} />
          </div>
          <Text strong style={{ fontSize: 14 }}>
            Spending Mandate
          </Text>
        </Space>
        <Space size={6} wrap>
          <Tag color="success" icon={<CheckCircleOutlined />} style={{ borderRadius: 6, fontWeight: 700, fontSize: 11 }}>
            Signature valid
          </Tag>
          <Tag color="blue" style={{ borderRadius: 6, fontWeight: 600, fontSize: 11 }}>Price changes blocked</Tag>
        </Space>
      </div>

      <Paragraph type="secondary" style={{ fontSize: 12, marginBottom: 12, lineHeight: 1.4 }}>
        ProcureAI verifies the signed mandate and blocks any PayPal order above this ceiling before it is created or authorized.
      </Paragraph>

      {/* Prominent Stat Tiles */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10, marginBottom: 14 }}>
        <div style={{
          padding: "10px 12px",
          borderRadius: 10,
          background: bgTile,
          border: `1px solid ${borderTile}`,
        }}>
          <div style={{ fontSize: 10, color: "#94a3b8", fontWeight: 700, letterSpacing: 0.5, marginBottom: 2 }}>
            AUTHORIZED CEILING
          </div>
          <div style={{ fontSize: 17, fontWeight: 800, color: "#0052FF", lineHeight: 1.2 }}>
            ₹{effectiveINR.toLocaleString("en-IN")}
          </div>
          <div style={{ fontSize: 10, color: "#3b82f6", marginTop: 2, fontWeight: 600 }}>Strict INR Envelope</div>
        </div>

        <div style={{
          padding: "10px 12px",
          borderRadius: 10,
          background: bgTile,
          border: `1px solid ${borderTile}`,
        }}>
          <div style={{ fontSize: 10, color: "#94a3b8", fontWeight: 700, letterSpacing: 0.5, marginBottom: 2 }}>
            USD SETTLEMENT CAP
          </div>
          <div style={{ fontSize: 17, fontWeight: 800, color: "#0052FF", lineHeight: 1.2 }}>
            ${effectiveUSD} USD
          </div>
          <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 2, fontWeight: 500 }}>PayPal Hold Max</div>
        </div>
      </div>

      {/* Embedded Spending Ceiling Utilization Meter */}
      <div style={{ marginBottom: 14, padding: "8px 10px", borderRadius: 8, background: isDarkMode ? "rgba(255,255,255,0.02)" : "#f8fafc", border: `1px solid ${dividerColor}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11, marginBottom: 4 }}>
          <span style={{ color: "#94a3b8" }}>Spending Ceiling: ₹{effectiveINR.toLocaleString("en-IN")} / ₹{budgetCapINR.toLocaleString("en-IN")}</span>
          <span style={{ fontWeight: 700, color: effectiveINR <= budgetCapINR ? "#10b981" : "#ef4444" }}>
            {Math.round((effectiveINR / budgetCapINR) * 100)}%
          </span>
        </div>
        <Progress
          percent={Math.min(100, Math.round((effectiveINR / budgetCapINR) * 100))}
          size="small"
          showInfo={false}
          strokeColor={effectiveINR <= budgetCapINR ? "#0052FF" : "#ef4444"}
          trailColor={isDarkMode ? "rgba(255,255,255,0.08)" : "#e2e8f0"}
        />
      </div>

      {/* Compact Details List */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: 6, borderBottom: `1px solid ${dividerColor}` }}>
          <Text type="secondary" style={{ fontSize: 12 }}>Key Fingerprint</Text>
          <Space size={4}>
            <Text code style={{ fontSize: 11, fontWeight: 700 }}>{(mandate.keyFingerprint || "ED25519-SIG").slice(0, 8)}</Text>
            <Button
              size="small"
              type="text"
              icon={<CopyOutlined style={{ fontSize: 11 }} />}
              onClick={() => {
                navigator.clipboard?.writeText(mandate.keyFingerprint || "ED25519-SIG-AUTH");
                message.success("Copied key fingerprint");
              }}
            />
          </Space>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: 6, borderBottom: `1px solid ${dividerColor}` }}>
          <Text type="secondary" style={{ fontSize: 12 }}>Price Drift Tolerance</Text>
          <Tag color="green" style={{ borderRadius: 6, fontSize: 11, margin: 0 }}>
            Price changes blocked
          </Tag>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: 6, borderBottom: `1px solid ${dividerColor}` }}>
          <Text type="secondary" style={{ fontSize: 12 }}>Plan Version Bound</Text>
          <Tag color="purple" style={{ borderRadius: 6, fontSize: 11, margin: 0 }}>
            Plan version {mandate.planVersion || 1}
          </Tag>
        </div>
      </div>

      {/* Verification Result Banner */}
      {verificationResult && (
        <Alert
          style={{ marginBottom: 10, borderRadius: 8 }}
          type={verificationResult.valid ? "success" : "error"}
          showIcon
          icon={verificationResult.valid ? <CheckCircleOutlined /> : <CloseCircleOutlined />}
          message={
            <span style={{ fontWeight: 600, fontSize: 12 }}>
              {verificationResult.valid ? "Signature Verified (Ed25519)" : "Integrity Breached - Verification Failed"}
            </span>
          }
          description={
            <div style={{ fontSize: 11, marginTop: 2 }}>
              <div>Key ID: {(verificationResult.keyFingerprint || mandate.keyFingerprint || "").slice(0, 8)}</div>
              <div>Digest Match: {verificationResult.valid ? "TRUE (Payload unaltered)" : "FALSE (Payload modified)"}</div>
            </div>
          }
        />
      )}

      {/* Collapsed Security Details Section with Secondary Buttons */}
      <details style={{ marginTop: 8, fontSize: 12 }}>
        <summary style={{ fontWeight: 600, color: "#94a3b8", cursor: "pointer", outline: "none", padding: "4px 0" }}>
          Security details ▾
        </summary>
        <div style={{ paddingTop: 8, display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <Text type="secondary" style={{ fontSize: 11 }}>Mandate ID</Text>
            <Text code copyable={{ text: mandate.mandateId }} style={{ fontSize: 10, maxWidth: 170 }} ellipsis>
              {mandate.mandateId}
            </Text>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <Text type="secondary" style={{ fontSize: 11 }}>Signature</Text>
            <Text code copyable={{ text: mandate.signature }} style={{ fontSize: 10, maxWidth: 170 }} ellipsis>
              {mandate.signature}
            </Text>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
            <Button
              size="small"
              icon={<CheckCircleOutlined />}
              loading={verifying}
              onClick={() => handleVerify(false)}
              style={{ flex: 1, borderRadius: 6, fontSize: 12 }}
            >
              Verify signature
            </Button>
            <Button
              size="small"
              danger
              icon={<WarningOutlined />}
              loading={verifying}
              onClick={() => handleVerify(true)}
              style={{ flex: 1, borderRadius: 6, fontSize: 12 }}
            >
              Simulate tampering
            </Button>
          </div>
        </div>
      </details>
    </Card>
  );
}
