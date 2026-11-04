// client/src/components/TradeoffConfirmModal.jsx
import React from "react";
import { Modal, Typography, Tag, Table, Row, Col, Button, Space, Divider } from "antd";
import {
  SwapOutlined,
  CheckCircleOutlined,
  ArrowRightOutlined,
  DollarCircleOutlined,
  ClockCircleOutlined,
  SafetyCertificateOutlined,
  UndoOutlined,
} from "@ant-design/icons";

const { Text, Title, Paragraph } = Typography;

function formatSpecs(specs) {
  if (!specs) return null;
  if (typeof specs === "string") return specs;
  if (typeof specs === "object") {
    return Object.entries(specs)
      .map(([k, v]) => `${k}: ${v}`)
      .join(" · ");
  }
  return String(specs);
}

export default function TradeoffConfirmModal({
  open,
  onClose,
  tradeoff,
  currentBudgetINR,
  currentDeliveryDays,
  currentTotalINR,
  onConfirmApply,
  isDarkMode = true,
}) {
  if (!tradeoff) return null;

  const {
    title,
    headline,
    description,
    badge,
    badgeColor,
    replacements = [],
    projectedTotalINR,
    actionDelta = {},
  } = tradeoff;

  const targetBudget = actionDelta.budgetINR !== undefined ? actionDelta.budgetINR : currentBudgetINR;
  const targetDays = actionDelta.maxDeliveryDays !== undefined ? actionDelta.maxDeliveryDays : currentDeliveryDays;
  const netDiff = projectedTotalINR - currentTotalINR;
  const isSaving = netDiff < 0;

  const columns = [
    {
      title: "Category",
      dataIndex: "category",
      key: "category",
      width: 110,
      render: (cat) => (
        <Tag color="blue" style={{ textTransform: "uppercase", fontSize: 10, fontWeight: 700 }}>
          {cat}
        </Tag>
      ),
    },
    {
      title: "Current Component",
      key: "fromItem",
      render: (_, r) => (
        <div>
          <div style={{ fontWeight: 600, fontSize: 13 }}>{r.fromItem?.name}</div>
          <div style={{ fontSize: 11, color: "#94a3b8", fontFamily: "var(--font-mono)" }}>
            ₹{Number(r.fromItem?.unitPriceINR).toLocaleString("en-IN")} × {r.quantity}
          </div>
          {r.fromItem?.specs && (
            <div style={{ fontSize: 10, color: "#64748b", marginTop: 2 }}>{formatSpecs(r.fromItem.specs)}</div>
          )}
        </div>
      ),
    },
    {
      title: "",
      key: "arrow",
      width: 36,
      align: "center",
      render: () => <ArrowRightOutlined style={{ color: "#38bdf8", fontSize: 12 }} />,
    },
    {
      title: "Proposed Replacement",
      key: "toItem",
      render: (_, r) => (
        <div>
          <div style={{ fontWeight: 600, fontSize: 13, color: isSaving ? "#10b981" : "#38bdf8" }}>
            {r.toItem?.name}
          </div>
          <div style={{ fontSize: 11, color: "#94a3b8", fontFamily: "var(--font-mono)" }}>
            ₹{Number(r.toItem?.unitPriceINR).toLocaleString("en-IN")} × {r.quantity}
          </div>
          {r.toItem?.specs && (
            <div style={{ fontSize: 10, color: "#64748b", marginTop: 2 }}>{formatSpecs(r.toItem.specs)}</div>
          )}
        </div>
      ),
    },
    {
      title: "Net Change",
      key: "diff",
      width: 130,
      align: "right",
      render: (_, r) => {
        const itemDiff = r.totalSavingsINR ? -r.totalSavingsINR : r.totalCostINR ? r.totalCostINR : 0;
        const isItemSave = itemDiff <= 0;
        return (
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontWeight: 800,
              fontSize: 13,
              color: isItemSave ? "#10b981" : "#38bdf8",
            }}
          >
            {isItemSave ? `-₹${Math.abs(itemDiff).toLocaleString("en-IN")}` : `+₹${itemDiff.toLocaleString("en-IN")}`}
          </span>
        );
      },
    },
  ];

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      width={780}
      centered
      title={
        <div style={{ display: "flex", alignItems: "center", gap: 10, paddingTop: 4 }}>
          <SwapOutlined style={{ color: "#38bdf8", fontSize: 18 }} />
          <span style={{ fontSize: 17, fontWeight: 700 }}>Confirm Sensitivity Trade-Off</span>
          <Tag color={badgeColor} style={{ marginLeft: "auto", fontWeight: 700, borderRadius: 6 }}>
            {badge}
          </Tag>
        </div>
      }
      styles={{
        content: {
          background: isDarkMode ? "#0b1222" : "#ffffff",
          border: `1px solid ${isDarkMode ? "rgba(255, 255, 255, 0.1)" : "#e2e8f0"}`,
          borderRadius: 18,
          padding: 24,
        },
      }}
    >
      <div style={{ marginTop: 12 }}>
        {/* Headline & Description */}
        <div style={{ fontSize: 16, fontWeight: 800, color: isSaving ? "#10b981" : "#38bdf8", marginBottom: 6 }}>
          {headline}
        </div>
        <Paragraph type="secondary" style={{ fontSize: 13, lineHeight: 1.6, marginBottom: 20 }}>
          {description}
        </Paragraph>

        {/* Parameter Impact Cards */}
        <Row gutter={[12, 12]} style={{ marginBottom: 20 }}>
          <Col xs={24} sm={8}>
            <div
              style={{
                padding: "12px 14px",
                borderRadius: 12,
                background: isDarkMode ? "rgba(255, 255, 255, 0.03)" : "#f8fafc",
                border: `1px solid ${isDarkMode ? "rgba(255, 255, 255, 0.07)" : "#e2e8f0"}`,
              }}
            >
              <div style={{ fontSize: 11, color: "#94a3b8", textTransform: "uppercase", fontWeight: 700 }}>
                Budget Ceiling
              </div>
              <div style={{ fontSize: 15, fontWeight: 700, marginTop: 4 }}>
                ₹{currentBudgetINR.toLocaleString("en-IN")}{" "}
                <ArrowRightOutlined style={{ fontSize: 11, color: "#64748b" }} /> ₹{targetBudget.toLocaleString("en-IN")}
              </div>
            </div>
          </Col>

          <Col xs={24} sm={8}>
            <div
              style={{
                padding: "12px 14px",
                borderRadius: 12,
                background: isDarkMode ? "rgba(255, 255, 255, 0.03)" : "#f8fafc",
                border: `1px solid ${isDarkMode ? "rgba(255, 255, 255, 0.07)" : "#e2e8f0"}`,
              }}
            >
              <div style={{ fontSize: 11, color: "#94a3b8", textTransform: "uppercase", fontWeight: 700 }}>
                Delivery Horizon
              </div>
              <div style={{ fontSize: 15, fontWeight: 700, marginTop: 4 }}>
                {currentDeliveryDays} Days{" "}
                <ArrowRightOutlined style={{ fontSize: 11, color: "#64748b" }} /> {targetDays} Days
              </div>
            </div>
          </Col>

          <Col xs={24} sm={8}>
            <div
              style={{
                padding: "12px 14px",
                borderRadius: 12,
                background: isDarkMode ? "rgba(255, 255, 255, 0.03)" : "#f8fafc",
                border: `1px solid ${isSaving ? "rgba(16, 185, 129, 0.3)" : "rgba(0, 82, 255, 0.3)"}`,
              }}
            >
              <div style={{ fontSize: 11, color: "#94a3b8", textTransform: "uppercase", fontWeight: 700 }}>
                Plan Total Shift
              </div>
              <div
                style={{
                  fontSize: 15,
                  fontWeight: 800,
                  marginTop: 4,
                  fontFamily: "var(--font-mono)",
                  color: isSaving ? "#10b981" : "#38bdf8",
                }}
              >
                ₹{projectedTotalINR.toLocaleString("en-IN")} (
                {isSaving ? `-₹${Math.abs(netDiff).toLocaleString("en-IN")}` : `+₹${netDiff.toLocaleString("en-IN")}`})
              </div>
            </div>
          </Col>
        </Row>

        {/* Itemized Replacements Table */}
        {replacements.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10, color: "#cbd5e1" }}>
              Itemized Component Adjustments ({replacements.length})
            </div>
            <Table
              dataSource={replacements.map((r, i) => ({ ...r, key: i }))}
              columns={columns}
              pagination={false}
              size="small"
              bordered
              style={{
                borderRadius: 10,
                overflow: "hidden",
                border: `1px solid ${isDarkMode ? "rgba(255, 255, 255, 0.08)" : "#e2e8f0"}`,
              }}
            />
          </div>
        )}

        {/* Guarantees */}
        <div
          style={{
            padding: "12px 16px",
            borderRadius: 10,
            background: isDarkMode ? "rgba(0, 82, 255, 0.06)" : "#eff6ff",
            border: `1px solid ${isDarkMode ? "rgba(0, 82, 255, 0.15)" : "#bfdbfe"}`,
            marginBottom: 24,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 10,
          }}
        >
          <Space size={16} wrap>
            <span style={{ fontSize: 12, color: "#94a3b8" }}>
              <CheckCircleOutlined style={{ color: "#10b981", marginRight: 5 }} />
              100% In-Stock Verified
            </span>
            <span style={{ fontSize: 12, color: "#94a3b8" }}>
              <SafetyCertificateOutlined style={{ color: "#38bdf8", marginRight: 5 }} />
              Hard Constraints Satisfied
            </span>
            <span style={{ fontSize: 12, color: "#94a3b8" }}>
              <UndoOutlined style={{ color: "#a855f7", marginRight: 5 }} />
              Reversible to Default Anytime
            </span>
          </Space>
        </div>

        {/* Action Buttons */}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}>
          <Button
            size="large"
            onClick={onClose}
            style={{ borderRadius: 10, fontWeight: 600, paddingLeft: 20, paddingRight: 20 }}
          >
            Cancel / Keep Current Plan
          </Button>
          <Button
            type="primary"
            size="large"
            icon={<CheckCircleOutlined />}
            onClick={() => onConfirmApply(tradeoff)}
            style={{
              borderRadius: 10,
              fontWeight: 700,
              background: isSaving ? "#10b981" : "#0052FF",
              borderColor: isSaving ? "#10b981" : "#0052FF",
              paddingLeft: 24,
              paddingRight: 24,
            }}
          >
            Confirm & Apply Plan Changes →
          </Button>
        </div>
      </div>
    </Modal>
  );
}
