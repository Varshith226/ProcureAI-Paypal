// client/src/components/BudgetCeilingMeter.jsx
import React from "react";
import { Progress, Space, Typography, Tag, Tooltip } from "antd";
import { SafetyCertificateOutlined, ExclamationCircleOutlined, CheckCircleOutlined } from "@ant-design/icons";

const { Text } = Typography;

export default function BudgetCeilingMeter({ currentTotalINR, maxCeilingINR, isDarkMode }) {
  const total = Number(currentTotalINR) || 0;
  const ceiling = Number(maxCeilingINR) || 60000;
  const pct = Math.min(100, Math.round((total / ceiling) * 100));
  const surplus = ceiling - total;
  const isOver = total > ceiling;
  const isClose = pct >= 95 && !isOver;

  const strokeColor = isOver
    ? "#ef4444"
    : isClose
    ? "#f59e0b"
    : "#0052FF";

  return (
    <div
      style={{
        padding: "14px 16px",
        borderRadius: 12,
        background: isDarkMode ? "rgba(15, 23, 42, 0.6)" : "#f8fafc",
        border: `1px solid ${isOver ? "rgba(239, 68, 68, 0.4)" : isDarkMode ? "rgba(255,255,255,0.08)" : "rgba(0, 82, 255, 0.15)"}`,
        marginBottom: 16,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <Space size={6} align="center">
          <SafetyCertificateOutlined style={{ color: strokeColor }} />
          <Text strong style={{ fontSize: 13, letterSpacing: "-0.01em" }}>
            Mandate Spending Ceiling
          </Text>
        </Space>
        {isOver ? (
          <Tag color="error" icon={<ExclamationCircleOutlined />}>
            CEILING EXCEEDED
          </Tag>
        ) : (
          <Tag color={isClose ? "warning" : "success"} icon={<CheckCircleOutlined />}>
            {surplus >= 0 ? `₹${surplus.toLocaleString("en-IN")} HEADROOM` : "AT CEILING"}
          </Tag>
        )}
      </div>

      <Progress
        percent={pct}
        strokeColor={strokeColor}
        showInfo={false}
        size={["100%", 8]}
        style={{ marginBottom: 6 }}
      />

      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
        <Text type="secondary">
          Basket: <strong style={{ color: strokeColor }}>₹{total.toLocaleString("en-IN")}</strong> ({pct}%)
        </Text>
        <Text type="secondary">
          Hard Cap: <strong>₹{ceiling.toLocaleString("en-IN")}</strong>
        </Text>
      </div>

      {isOver && (
        <div
          style={{
            marginTop: 8,
            padding: "6px 10px",
            borderRadius: 6,
            background: "rgba(239, 68, 68, 0.1)",
            color: "#ef4444",
            fontSize: 11,
            fontWeight: 600,
          }}
        >
          Safety Boundary: Order total exceeds the authorized spending limit. PayPal checkout is cryptographically blocked.
        </div>
      )}
    </div>
  );
}

