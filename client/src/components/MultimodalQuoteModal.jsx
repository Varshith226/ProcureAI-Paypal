// client/src/components/MultimodalQuoteModal.jsx
import React, { useState } from "react";
import { Modal, Input, Button, Space, Typography, Tag, Alert, Card, Row, Col, message } from "antd";
import {
  FileTextOutlined,
  CheckCircleOutlined,
  DollarOutlined,
  ThunderboltOutlined,
  SafetyCertificateOutlined,
} from "@ant-design/icons";
import { compareQuote } from "../api/paypalApi";

const { TextArea } = Input;
const { Text, Paragraph } = Typography;

export default function MultimodalQuoteModal({ open, onClose, budgetINR = 60000, isDarkMode = true }) {
  const [quoteText, setQuoteText] = useState(
    "Vendor Quotation from Nehru Place Wholesale:\n- 1x Dell 24-inch Monitor 60Hz\n- 1x Mechanical Keyboard\n- 1x Gaming Mouse & HyperX Headset\nTotal Quoted Price: Rs 68,500\nPayment Terms: 100% advance UPI before dispatch, no returns."
  );
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState(null);

  const handleAnalyze = async () => {
    setAnalyzing(true);
    try {
      const res = await compareQuote({ rawText: quoteText, budgetINR });
      setAnalysis(res);
      message.success("Quote extracted and compared against verified ProcureAI plan!");
    } catch (err) {
      message.error(`Quote comparison failed: ${err.message}`);
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      width={680}
      title={
        <Space align="center">
          <FileTextOutlined style={{ color: "#0052FF" }} />
          <span style={{ fontWeight: 800 }}>📄 Existing Quote & WhatsApp Message Intake</span>
          <Tag color="blue">AI Competitive Audit</Tag>
        </Space>
      }
    >
      <Paragraph type="secondary" style={{ fontSize: 13, marginBottom: 14 }}>
        Paste raw text from a vendor email, PDF quote or WhatsApp message. Gemini parses line items and compares prices against our verified catalog plans:
      </Paragraph>

      <TextArea
        rows={4}
        value={quoteText}
        onChange={(e) => setQuoteText(e.target.value)}
        placeholder="Paste supplier quote or WhatsApp procurement message..."
        style={{ borderRadius: 8, marginBottom: 14 }}
      />

      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
        <Button
          type="primary"
          icon={<ThunderboltOutlined />}
          loading={analyzing}
          onClick={handleAnalyze}
          style={{ background: "#0052FF", borderRadius: 8, fontWeight: 700 }}
        >
          Extract & Compare Savings →
        </Button>
      </div>

      {analysis && (
        <div>
          {/* Comparison Cards */}
          <Row gutter={12} style={{ marginBottom: 16 }}>
            <Col span={12}>
              <Card
                size="small"
                style={{
                  borderRadius: 10,
                  background: isDarkMode ? "rgba(239, 68, 68, 0.1)" : "#fef2f2",
                  border: "1px solid rgba(239, 68, 68, 0.2)",
                  textAlign: "center",
                }}
              >
                <Text type="secondary" style={{ fontSize: 12 }}>Unverified Supplier Quote</Text>
                <div style={{ fontSize: 20, fontWeight: 800, color: "#ef4444", marginTop: 4 }}>
                  ₹{analysis.quotedTotalINR.toLocaleString("en-IN")}
                </div>
                <div style={{ fontSize: 11, color: "#94a3b8" }}>100% Upfront · No Hold Protection</div>
              </Card>
            </Col>
            <Col span={12}>
              <Card
                size="small"
                style={{
                  borderRadius: 10,
                  background: isDarkMode ? "rgba(16, 185, 129, 0.1)" : "#f0fdf4",
                  border: "1px solid rgba(16, 185, 129, 0.3)",
                  textAlign: "center",
                }}
              >
                <Text type="secondary" style={{ fontSize: 12 }}>ProcureAI Verified Plan</Text>
                <div style={{ fontSize: 20, fontWeight: 800, color: "#10b981", marginTop: 4 }}>
                  ₹{analysis.ourPlanTotalINR.toLocaleString("en-IN")}
                </div>
                <div style={{ fontSize: 11, color: "#10b981", fontWeight: 700 }}>
                  Save ₹{analysis.potentialSavingsINR.toLocaleString("en-IN")} ({analysis.savingsPct}%)
                </div>
              </Card>
            </Col>
          </Row>

          <Alert
            type="success"
            showIcon
            style={{ borderRadius: 10, marginBottom: 14 }}
            message={<Text strong>Verified Competitive Advantage</Text>}
            description={
              <ul style={{ margin: "6px 0 0 0", paddingLeft: 16, fontSize: 12 }}>
                {analysis.verifiedAdvantages.map((adv, i) => (
                  <li key={i} style={{ marginBottom: 4 }}>{adv}</li>
                ))}
              </ul>
            }
          />
        </div>
      )}
    </Modal>
  );
}

