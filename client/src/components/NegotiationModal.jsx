// client/src/components/NegotiationModal.jsx
import React, { useState } from "react";
import { Modal, Typography, Space, Tag, Button, Alert, Card, Row, Col, Progress, Spin, message } from "antd";
import {
  RocketOutlined,
  CheckCircleOutlined,
  UserOutlined,
  ShopOutlined,
  DollarOutlined,
  SafetyCertificateOutlined,
  ArrowRightOutlined,
} from "@ant-design/icons";
import { negotiateDiscount } from "../api/paypalApi";

const { Text, Paragraph } = Typography;

export default function NegotiationModal({
  open,
  onClose,
  plan,
  strategyKey,
  onApplyRebate,
  isDarkMode = true,
}) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const selectedStrategy = plan?.strategies?.[strategyKey] || Object.values(plan?.strategies || {})[0];
  const totalINR = selectedStrategy?.totalINR || 60000;
  const items = selectedStrategy?.items || [];

  const handleStartNegotiation = async () => {
    setLoading(true);
    try {
      const data = await negotiateDiscount({
        planId: plan?.planId,
        items,
        currentTotalINR: totalINR,
        maxRounds: 3,
      });
      setResult(data);
      message.success(`Negotiation completed! ₹${data.finalDiscountINR.toLocaleString("en-IN")} concession secured.`);
    } catch (err) {
      message.error(`Negotiation failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      width={720}
      title={
        <Space align="center">
          <RocketOutlined style={{ color: "#7c3aed", fontSize: 18 }} />
          <Text strong style={{ fontSize: 16 }}>
            Autonomous 2-Agent B2B Discount Negotiation
          </Text>
          {result && (
            <Tag color={result.mode === "GEMINI_LLM" ? "purple" : "orange"}>
              {result.mode === "GEMINI_LLM" ? "⚡ Gemini Live LLM" : "⚙️ Offline Simulation"}
            </Tag>
          )}
        </Space>
      }
    >
      <div style={{ padding: "4px 0" }}>
        <Paragraph type="secondary" style={{ fontSize: 13, marginBottom: 16 }}>
          ProcureAI Buyer Agent negotiates volume discounts directly against distributor quote engines using bundle leverage and PayPal Pay-on-Delivery Authorization Hold commitment:
        </Paragraph>

        {!result && !loading && (
          <div style={{ textAlign: "center", padding: "30px 20px" }}>
            <ShopOutlined style={{ fontSize: 42, color: "#7c3aed", marginBottom: 12 }} />
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 6 }}>
              Ready to Negotiate Basket: ₹{totalINR.toLocaleString("en-IN")}
            </div>
            <Paragraph type="secondary" style={{ maxWidth: 440, margin: "0 auto 20px auto", fontSize: 13 }}>
              Buyer Agent will initiate 3 structured rounds proposing a pay-on-delivery authorization hold purchase, seeking volume concessions within merchant cost floor boundaries.
            </Paragraph>
            <Button
              type="primary"
              size="large"
              icon={<RocketOutlined />}
              onClick={handleStartNegotiation}
              style={{
                background: "linear-gradient(135deg, #7c3aed, #4f46e5)",
                borderColor: "#7c3aed",
                borderRadius: 10,
                fontWeight: 700,
                padding: "0 28px",
              }}
            >
              Start Autonomous Negotiation →
            </Button>
          </div>
        )}

        {loading && (
          <div style={{ textAlign: "center", padding: "40px 20px" }}>
            <Spin size="large" />
            <div style={{ marginTop: 16, fontWeight: 700, fontSize: 14 }}>
              Buyer Agent negotiating with wholesale distributor engine...
            </div>
            <Text type="secondary" style={{ fontSize: 12 }}>
              Evaluating margin thresholds and volume discount concessions
            </Text>
          </div>
        )}

        {result && (
          <div>
            {/* Round-by-round chat transcript */}
            <div
              style={{
                maxHeight: 380,
                overflowY: "auto",
                padding: "12px 14px",
                borderRadius: 12,
                background: isDarkMode ? "rgba(2, 6, 23, 0.4)" : "#f8fafc",
                border: "1px solid rgba(124, 58, 237, 0.2)",
                marginBottom: 16,
              }}
            >
              {result.rounds.map((round) => (
                <div key={round.round} style={{ marginBottom: 18 }}>
                  <div style={{ textAlign: "center", marginBottom: 10 }}>
                    <Tag color="purple">Round {round.round}</Tag>
                  </div>

                  {/* Buyer message */}
                  <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
                    <div
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: "50%",
                        background: "#0052FF",
                        color: "#fff",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      <UserOutlined />
                    </div>
                    <div
                      style={{
                        padding: "10px 14px",
                        borderRadius: "4px 14px 14px 14px",
                        background: isDarkMode ? "#1e293b" : "#e0e7ff",
                        maxWidth: "85%",
                        fontSize: 12,
                      }}
                    >
                      <div style={{ fontWeight: 700, color: "#0052FF", marginBottom: 2 }}>Buyer Agent</div>
                      <div>{round.buyerMessage}</div>
                      <div style={{ marginTop: 4, fontWeight: 600, fontSize: 11, color: "#64748b" }}>
                        Offer: ₹{round.buyerOfferINR.toLocaleString("en-IN")} (${round.buyerOfferUsd} USD)
                      </div>
                    </div>
                  </div>

                  {/* Vendor message */}
                  <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                    <div
                      style={{
                        padding: "10px 14px",
                        borderRadius: "14px 4px 14px 14px",
                        background: isDarkMode ? "#312e81" : "#ede9fe",
                        maxWidth: "85%",
                        fontSize: 12,
                        textAlign: "right",
                      }}
                    >
                      <div style={{ fontWeight: 700, color: "#7c3aed", marginBottom: 2 }}>Distributor Engine</div>
                      <div>{round.vendorMessage}</div>
                      <div style={{ marginTop: 4, fontWeight: 600, fontSize: 11, color: "#64748b" }}>
                        Counter: ₹{round.vendorCounterINR.toLocaleString("en-IN")} (${round.vendorCounterUsd} USD)
                      </div>
                    </div>
                    <div
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: "50%",
                        background: "#7c3aed",
                        color: "#fff",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      <ShopOutlined />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Outcome alert */}
            <Alert
              type="success"
              showIcon
              style={{ marginBottom: 16, borderRadius: 12 }}
              message={
                <Text strong style={{ fontSize: 14 }}>
                  Negotiation Succeeded — ₹{result.finalDiscountINR.toLocaleString("en-IN")} Instant Rebate Secured!
                </Text>
              }
              description={
                <div>
                  <Text>
                    Merchant Distributor approved promotional token <Text code>{result.rebateCode}</Text>. New plan total is{" "}
                    <strong>₹{result.finalTotalINR.toLocaleString("en-IN")} (${result.finalTotalUSD} USD)</strong>.
                  </Text>
                  <div style={{ fontSize: 11, color: "#64748b", marginTop: 4 }}>
                    Server Margin Guard: Vendor floor price ₹{result.marginMetrics?.vendorFloorPriceINR?.toLocaleString("en-IN")} preserved ({result.marginMetrics?.discountPct}% net concession).
                  </div>
                </div>
              }
            />

            {/* Actions */}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}>
              <Button onClick={onClose} style={{ borderRadius: 8 }}>
                Dismiss
              </Button>
              <Button
                type="primary"
                icon={<CheckCircleOutlined />}
                style={{
                  background: "#7c3aed",
                  borderColor: "#7c3aed",
                  borderRadius: 8,
                  fontWeight: 700,
                }}
                onClick={() => {
                  onApplyRebate(result.finalDiscountINR, result);
                  onClose();
                }}
              >
                Apply Negotiated Rebate (-₹{result.finalDiscountINR.toLocaleString("en-IN")}) →
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

