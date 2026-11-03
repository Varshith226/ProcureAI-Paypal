// client/src/components/EscrowFlowVisual.jsx
import React from "react";
import { Typography, Tag, Space } from "antd";
import {
  LockOutlined,
  CheckCircleOutlined,
  DollarOutlined,
  ShopOutlined,
  UserOutlined,
  ClockCircleOutlined,
  SafetyCertificateOutlined,
  ArrowDownOutlined,
} from "@ant-design/icons";

const { Text } = Typography;

export default function EscrowFlowVisual({
  status = "DRAFT", // "DRAFT" | "AUTHORIZED" | "DELIVERED" | "CAPTURED" | "PARTIALLY_CAPTURED" | "VOIDED"
  amountUSD = "714.00",
  amountINR = 60000,
  isDarkMode = true,
  slaCreditPct = 0,
  authorizationExpiresAt = null,
}) {
  const isAuthorized = ["AUTHORIZED", "DELIVERED", "CAPTURED", "PARTIALLY_CAPTURED"].includes(status);
  const isCaptured = ["CAPTURED", "PARTIALLY_CAPTURED", "VENDOR_PAID"].includes(status);
  const isVoided = status === "VOIDED";
  const isSlaBreach = status === "PARTIALLY_CAPTURED" || slaCreditPct > 0;

  const expiryDisplay = authorizationExpiresAt
    ? new Date(authorizationExpiresAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
    : "within authorization window";

  return (
    <div
      style={{
        padding: "16px 20px",
        borderRadius: 16,
        background: isDarkMode ? "rgba(15, 23, 42, 0.7)" : "#ffffff",
        border: `1px solid ${isDarkMode ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 82, 255, 0.15)"}`,
        boxShadow: "0 4px 20px -5px rgba(0, 82, 255, 0.1)",
        marginBottom: 20,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
        <Space size={8}>
          <SafetyCertificateOutlined style={{ color: "#0052FF", fontSize: 16 }} />
          <Text strong style={{ fontSize: 14 }}>
            PayPal Pay-on-Delivery Authorization Hold Pipeline
          </Text>
        </Space>
        {isCaptured ? (
          <Tag color="green" icon={<CheckCircleOutlined />} style={{ borderRadius: 6, fontWeight: 700 }}>
            DELIVERY CONFIRMED & SETTLED
          </Tag>
        ) : isAuthorized ? (
          <Tag color="processing" icon={<ClockCircleOutlined />} style={{ borderRadius: 6, fontWeight: 700 }}>
            AUTHORIZATION HOLD ACTIVE (VALID UNTIL {expiryDisplay.toUpperCase()})
          </Tag>
        ) : isVoided ? (
          <Tag color="error" style={{ borderRadius: 6, fontWeight: 700 }}>AUTHORIZATION VOIDED</Tag>
        ) : (
          <Tag color="default" style={{ borderRadius: 6 }}>PRE-AUTHORIZATION DRAFT</Tag>
        )}
      </div>

      {/* 3-Node Architecture Pipeline */}
      <div
        className="escrow-pipeline-grid"
        style={{
          padding: "14px 12px",
          background: isDarkMode ? "rgba(2, 6, 23, 0.5)" : "#f8fafc",
          borderRadius: 12,
        }}
      >
        {/* Node 1: Buyer */}
        <div
          style={{
            padding: "12px 10px",
            borderRadius: 10,
            textAlign: "center",
            background: isDarkMode ? "#1e293b" : "#ffffff",
            border: "1px solid rgba(0, 82, 255, 0.2)",
          }}
        >
          <UserOutlined style={{ fontSize: 20, color: "#0052FF", marginBottom: 4 }} />
          <div style={{ fontWeight: 700, fontSize: 13 }}>Buyer Org</div>
          <div style={{ fontSize: 11, color: "#94a3b8" }}>₹{Number(amountINR).toLocaleString("en-IN")}</div>
        </div>

        {/* Arrow 1 */}
        <div className="escrow-arrow" style={{ textAlign: "center", color: isAuthorized ? "#0052FF" : "#94a3b8", fontWeight: 700 }}>
          <span className="escrow-arrow-desktop">{isAuthorized ? "➜ [Hold]" : "⇢"}</span>
          <span className="escrow-arrow-mobile">{isAuthorized ? "▼ [Hold]" : "▼"}</span>
        </div>

        {/* Node 2: PayPal Authorization Hold */}
        <div
          style={{
            padding: "14px 12px",
            borderRadius: 12,
            textAlign: "center",
            background: isAuthorized
              ? isCaptured
                ? "rgba(16, 185, 129, 0.12)"
                : "rgba(0, 82, 255, 0.12)"
              : isDarkMode
              ? "#1e293b"
              : "#ffffff",
            border: `2px solid ${isAuthorized ? (isCaptured ? "#10b981" : "#0052FF") : "rgba(148, 163, 184, 0.3)"}`,
            boxShadow: isAuthorized && !isCaptured ? "0 0 15px rgba(0, 82, 255, 0.2)" : "none",
          }}
        >
          <LockOutlined
            style={{
              fontSize: 22,
              color: isCaptured ? "#10b981" : isAuthorized ? "#0052FF" : "#94a3b8",
              marginBottom: 4,
            }}
          />
          <div style={{ fontWeight: 800, fontSize: 13, color: isCaptured ? "#10b981" : isAuthorized ? "#0052FF" : "inherit" }}>
            PayPal Authorization Hold
          </div>
          <div style={{ fontSize: 11, fontWeight: 600 }}>
            {isAuthorized ? `$${amountUSD} USD Held` : "Ready to Authorize"}
          </div>
          {isSlaBreach && (
            <div style={{ fontSize: 10, color: "#f59e0b", marginTop: 2, fontWeight: 700 }}>
              {slaCreditPct}% SLA Credit Applied
            </div>
          )}
        </div>

        {/* Arrow 2 */}
        <div className="escrow-arrow" style={{ textAlign: "center", color: isCaptured ? "#10b981" : "#94a3b8", fontWeight: 700 }}>
          <span className="escrow-arrow-desktop">{isCaptured ? "➜ [Paid]" : "⇢"}</span>
          <span className="escrow-arrow-mobile">{isCaptured ? "▼ [Paid]" : "▼"}</span>
        </div>

        {/* Node 3: Merchant / Vendor */}
        <div
          style={{
            padding: "12px 10px",
            borderRadius: 10,
            textAlign: "center",
            background: isCaptured ? (isDarkMode ? "#064e3b" : "#ecfdf5") : isDarkMode ? "#1e293b" : "#ffffff",
            border: `1px solid ${isCaptured ? "#10b981" : "rgba(148, 163, 184, 0.2)"}`,
          }}
        >
          <ShopOutlined style={{ fontSize: 20, color: isCaptured ? "#10b981" : "#94a3b8", marginBottom: 4 }} />
          <div style={{ fontWeight: 700, fontSize: 13 }}>Merchant / Seller</div>
          <div style={{ fontSize: 11, color: isCaptured ? "#10b981" : "#94a3b8" }}>
            {isCaptured ? "Settled (-1.5%)" : "On Delivery"}
          </div>
        </div>
      </div>

      <div style={{ marginTop: 12, fontSize: 12, color: "#94a3b8", lineHeight: 1.5 }}>
        {status === "AUTHORIZED" && (
          <span>
            🔒 <strong>Funds held under PayPal authorization.</strong> Funds remain held until {expiryDisplay}. Authorization valid up to 29 days; funds guaranteed ~3 days (honor period); reauthorize if delivery is later. Funds cannot be captured until you verify delivery.
          </span>
        )}
        {status === "CAPTURED" && (
          <span style={{ color: "#10b981" }}>
            ✓ <strong>Delivery confirmed.</strong> PayPal authorization captured and merchant paid via PayPal Payouts with a 1.5% platform fee deducted.
          </span>
        )}
        {status === "PARTIALLY_CAPTURED" && (
          <span style={{ color: "#f59e0b" }}>
            ⚡ <strong>SLA breach adjustment:</strong> 10% delivery delay credit retained by buyer. 90% captured and remaining 10% authorization immediately voided by PayPal.
          </span>
        )}
        {status === "DRAFT" && (
          <span>
            ℹ️ <strong>Pay-on-Delivery Authorization Hold:</strong> Once approved, PayPal authorizes and holds funds. You pay only after physical goods arrive and pass specifications.
          </span>
        )}
      </div>
    </div>
  );
}
