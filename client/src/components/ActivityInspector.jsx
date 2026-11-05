// client/src/components/ActivityInspector.jsx
import React, { useState } from "react";
import { Drawer, Space, Typography, Tag, Button, List, Dropdown, message } from "antd";
import {
  ThunderboltOutlined,
  CopyOutlined,
  PlayCircleOutlined,
  CheckCircleOutlined,
  DownOutlined,
} from "@ant-design/icons";
import { simulateWebhook } from "../api/paypalApi";

const { Text, Paragraph } = Typography;

export default function ActivityInspector({
  open,
  onClose,
  events = [],
  isSseConnected = false,
  isDarkMode = true,
  onSimulateWebhook,
}) {
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [simulating, setSimulating] = useState(false);

  const handleSimulate = async (eventType) => {
    setSimulating(true);
    try {
      const res = await simulateWebhook({ eventType });
      message.success(`Simulated webhook ${eventType} broadcast!`);
      if (onSimulateWebhook) onSimulateWebhook(res);
    } catch (err) {
      message.error(`Simulation failed: ${err.message}`);
    } finally {
      setSimulating(false);
    }
  };

  const simulationMenu = {
    items: [
      { key: "PAYMENT.AUTHORIZATION.CREATED", label: "PAYMENT.AUTHORIZATION.CREATED" },
      { key: "CHECKOUT.ORDER.APPROVED", label: "CHECKOUT.ORDER.APPROVED" },
      { key: "PAYMENT.CAPTURE.COMPLETED", label: "PAYMENT.CAPTURE.COMPLETED" },
      { key: "PAYMENT.AUTHORIZATION.VOIDED", label: "PAYMENT.AUTHORIZATION.VOIDED" },
      { key: "PAYMENT.CAPTURE.REFUNDED", label: "PAYMENT.CAPTURE.REFUNDED" },
      { key: "PAYMENT.PAYOUTSBATCH.SUCCESS", label: "PAYMENT.PAYOUTSBATCH.SUCCESS" },
    ],
    onClick: ({ key }) => handleSimulate(key),
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width={600}
      title={
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" }}>
          <Space align="center">
            <ThunderboltOutlined style={{ color: "#0052FF" }} />
            <span style={{ fontWeight: 800 }}>⚡ Activity & API Inspector</span>
            <Tag color={isSseConnected ? "green" : "orange"}>
              {isSseConnected ? "● SSE LIVE" : "POLLING"}
            </Tag>
          </Space>
          <Space>
            <Dropdown menu={simulationMenu}>
              <Button size="small" type="primary" icon={<PlayCircleOutlined />} loading={simulating}>
                Simulate Webhook <DownOutlined />
              </Button>
            </Dropdown>
            <Button
              size="small"
              icon={<CopyOutlined />}
              onClick={() => {
                navigator.clipboard.writeText(JSON.stringify(events, null, 2));
                message.success("Copied activity log JSON!");
              }}
            >
              Copy
            </Button>
          </Space>
        </div>
      }
    >
      <Paragraph type="secondary" style={{ fontSize: 13, marginBottom: 16 }}>
        Real-time telemetry trace of all Gemini tool invocations, deterministic optimizer steps, signed spending mandates, PayPal Orders v2 calls, and SSE webhook deliveries:
      </Paragraph>

      <List
        dataSource={events}
        renderItem={(evt, idx) => {
          const isTool = evt.tool || evt.action?.includes("agent");
          const isPaypal = evt.action?.includes("paypal") || evt.eventType?.includes("PAYMENT");
          return (
            <div
              key={evt.id || idx}
              onClick={() => setSelectedEvent(selectedEvent?.id === evt.id ? null : evt)}
              style={{
                padding: "10px 12px",
                borderRadius: 8,
                marginBottom: 8,
                cursor: "pointer",
                background: selectedEvent?.id === evt.id
                  ? isDarkMode ? "rgba(0, 82, 255, 0.15)" : "#eff6ff"
                  : isDarkMode ? "#1e293b" : "#f8fafc",
                border: "1px solid rgba(148, 163, 184, 0.15)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <Space wrap size={6}>
                  <Tag color={isPaypal ? "gold" : isTool ? "purple" : "blue"}>
                    {evt.tool || evt.eventType || evt.action || "EVENT"}
                  </Tag>
                  {isPaypal && (
                    evt.isSimulation || String(evt.summary || "").includes("SIMULATION") ? (
                      <Tag color="orange" style={{ fontSize: 10, borderRadius: 4 }}>Simulation</Tag>
                    ) : (
                      <Tag color="green" style={{ fontSize: 10, borderRadius: 4 }}>PayPal-signed (verified)</Tag>
                    )
                  )}
                  <Text strong style={{ fontSize: 13 }}>
                    {evt.details || evt.summary || (evt.input ? JSON.stringify(evt.input).slice(0, 45) + "..." : "Executed")}
                  </Text>
                </Space>
                <span style={{ fontSize: 11, color: "#94a3b8", fontFamily: "var(--font-mono)" }}>
                  {evt.durationMs ? `${evt.durationMs}ms` : ""} {evt.timestamp ? new Date(evt.timestamp).toLocaleTimeString() : ""}
                </span>
              </div>

              {selectedEvent?.id === evt.id && (
                <div style={{ marginTop: 8 }}>
                  <pre
                    style={{
                      margin: 0,
                      padding: 8,
                      borderRadius: 6,
                      background: isDarkMode ? "#090d16" : "#f1f5f9",
                      fontSize: 11,
                      maxHeight: 200,
                      overflowY: "auto",
                    }}
                  >
                    {JSON.stringify(evt.output || evt.payload || evt, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          );
        }}
      />
    </Drawer>
  );
}

