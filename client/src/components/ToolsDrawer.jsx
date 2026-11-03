// client/src/components/ToolsDrawer.jsx
import React from "react";
import { Drawer, List, Typography, Tag, Space, Button, Divider } from "antd";
import {
  DatabaseOutlined,
  FileTextOutlined,
  CompassOutlined,
  AuditOutlined,
  ThunderboltOutlined,
  RocketOutlined,
  LockOutlined,
  RiseOutlined,
  CheckCircleOutlined,
} from "@ant-design/icons";

const { Text, Title } = Typography;

export default function ToolsDrawer({
  open,
  onClose,
  isDarkMode,
  onOpenOrdersLedger,
  onOpenQuoteIntake,
  onOpenCatalogExplorer,
  onOpenAuditLog,
  onOpenNegotiation,
  onTriggerPreset,
}) {
  const tools = [
    {
      key: "ledger",
      title: "Orders Ledger",
      subtitle: "Live persistence table powered by AG Grid Community v36",
      tag: "AG Grid v36",
      tagColor: "blue",
      icon: <DatabaseOutlined style={{ fontSize: 18, color: "#0052FF" }} />,
      onClick: () => {
        onClose();
        onOpenOrdersLedger();
      },
    },
    {
      key: "catalog",
      title: "Hardware Catalog Explorer",
      subtitle: "Full 36-component inventory with specs, pricing & stock",
      tag: "Live Inventory",
      tagColor: "cyan",
      icon: <CompassOutlined style={{ fontSize: 18, color: "#06B6D4" }} />,
      onClick: () => {
        onClose();
        onOpenCatalogExplorer();
      },
    },
    {
      key: "quote",
      title: "Multimodal Quote Intake",
      subtitle: "Paste or upload supplier quotes for instant price comparison",
      tag: "AI Intake",
      tagColor: "purple",
      icon: <FileTextOutlined style={{ fontSize: 18, color: "#8B5CF6" }} />,
      onClick: () => {
        onClose();
        onOpenQuoteIntake();
      },
    },
    {
      key: "audit",
      title: "Cryptographic Audit Log & SSE",
      subtitle: "Tamper-evident SHA-256 event ledger & real-time webhook stream",
      tag: "SHA-256 Chain",
      tagColor: "green",
      icon: <AuditOutlined style={{ fontSize: 18, color: "#10B981" }} />,
      onClick: () => {
        onClose();
        onOpenAuditLog();
      },
    },
    {
      key: "negotiation",
      title: "AI Vendor Negotiator",
      subtitle: "Autonomous two-agent margin negotiation terminal",
      tag: "Agentic",
      tagColor: "gold",
      icon: <ThunderboltOutlined style={{ fontSize: 18, color: "#F59E0B" }} />,
      onClick: () => {
        onClose();
        onOpenNegotiation();
      },
    },
  ];

  const presets = [
    {
      id: 1,
      title: "1️⃣ Step 1: ₹60,000 Setup Request",
      desc: "Loads gaming/coding brief and parses constraints",
      icon: <RocketOutlined />,
    },
    {
      id: 2,
      title: "2️⃣ Step 2: AG Grid Plan Matrix",
      desc: "Opens editable multi-strategy matrix",
      icon: <DatabaseOutlined />,
    },
    {
      id: 3,
      title: "3️⃣ Step 2: Vendor Negotiation (-5%)",
      desc: "Runs real 2-agent autonomous price negotiation",
      icon: <ThunderboltOutlined />,
    },
    {
      id: 4,
      title: "4️⃣ Step 3: Mandate & Authorization",
      desc: "Selects Plan B and signs Ed25519 spending mandate",
      icon: <LockOutlined />,
    },
    {
      id: 5,
      title: "5️⃣ Safety: Price Spike Lock",
      desc: "Simulates retailer price change to demonstrate safety revalidation",
      icon: <RiseOutlined />,
    },
  ];

  return (
    <Drawer
      title={
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Space>
            <DatabaseOutlined style={{ color: "#0052FF" }} />
            <Text strong>System Tools & Audit Ledger</Text>
          </Space>
          <Tag color="blue" style={{ borderRadius: 6 }}>ProcureAI v2.5</Tag>
        </div>
      }
      placement="right"
      width={440}
      onClose={onClose}
      open={open}
      styles={{
        body: { padding: "16px 20px" },
      }}
    >
      <div style={{ marginBottom: 20 }}>
        <Text type="secondary" style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 700 }}>
          Executive Modules
        </Text>
        <List
          itemLayout="horizontal"
          dataSource={tools}
          renderItem={(item) => (
            <div
              onClick={item.onClick}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "12px 14px",
                marginTop: 8,
                borderRadius: 12,
                cursor: "pointer",
                background: isDarkMode ? "rgba(255, 255, 255, 0.03)" : "#f8fafc",
                border: `1px solid ${isDarkMode ? "rgba(255, 255, 255, 0.06)" : "#e2e8f0"}`,
                transition: "all 0.15s ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = "#0052FF";
                e.currentTarget.style.transform = "translateX(4px)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = isDarkMode ? "rgba(255, 255, 255, 0.06)" : "#e2e8f0";
                e.currentTarget.style.transform = "translateX(0)";
              }}
            >
              <div
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 10,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: isDarkMode ? "rgba(0, 82, 255, 0.1)" : "#eff6ff",
                }}
              >
                {item.icon}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <Text strong style={{ fontSize: 13 }}>{item.title}</Text>
                  <Tag color={item.tagColor} style={{ fontSize: 10, borderRadius: 4, margin: 0 }}>{item.tag}</Tag>
                </div>
                <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {item.subtitle}
                </div>
              </div>
            </div>
          )}
        />
      </div>

      <Divider style={{ margin: "20px 0" }} />

      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <Text type="secondary" style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 700 }}>
            🎯 3-Minute Demo Guide (Judge Quick-Jumps)
          </Text>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {presets.map((p) => (
            <Button
              key={p.id}
              block
              style={{
                height: "auto",
                padding: "10px 12px",
                textAlign: "left",
                borderRadius: 10,
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-start",
                gap: 2,
              }}
              onClick={() => {
                onClose();
                onTriggerPreset(p.id);
              }}
            >
              <div style={{ fontWeight: 600, fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}>
                {p.icon} {p.title}
              </div>
              <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 400 }}>
                {p.desc}
              </div>
            </Button>
          ))}
        </div>
      </div>
    </Drawer>
  );
}

