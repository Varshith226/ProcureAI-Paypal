// client/src/components/PayPalInvoiceModal.jsx
import React, { useRef } from "react";
import { Modal, Button, Tag, Space, Typography, Divider, Table, message, Card } from "antd";
import {
  PrinterOutlined,
  CopyOutlined,
  CheckCircleOutlined,
  SafetyCertificateOutlined,
  FileTextOutlined,
  DollarOutlined,
} from "@ant-design/icons";

const { Text, Title } = Typography;

export default function PayPalInvoiceModal({
  open,
  onClose,
  invoiceData,
  orderData,
  lockedPlan,
  isDarkMode = true,
}) {
  const invoiceRef = useRef();

  if (!invoiceData && !orderData) return null;

  const invoiceId =
    invoiceData?.invoiceId ||
    invoiceData?.invoiceNumber ||
    orderData?.invoice_id ||
    "INV2-ZDCE-X57J-YBW4-UZZB";

  const orderId =
    orderData?.order_id ||
    lockedPlan?.orderID ||
    "ORD-SANDBOX-MWQ81-01";

  const mandateId =
    orderData?.mandate_id ||
    lockedPlan?.mandate?.mandateId ||
    "mandate_1793712109282_6306";

  const totalUSD = Number(
    invoiceData?.totalUSD ||
    orderData?.total_usd ||
    lockedPlan?.lockedTotalUSD ||
    373.88
  ).toFixed(2);

  const totalINR = Number(
    invoiceData?.totalINR ||
    orderData?.total_inr ||
    lockedPlan?.lockedTotalINR ||
    35492
  );

  const items = invoiceData?.items || lockedPlan?.strategy?.items || [
    { name: "LG UltraGear 24GN65R 24\" IPS 144Hz Monitor", category: "MONITOR", quantity: 1, unitPriceINR: 12499 },
    { name: "Keychron V1 QMK Custom Mechanical Keyboard", category: "KEYBOARD", quantity: 1, unitPriceINR: 7999 },
    { name: "Razer Viper V3 HyperSpeed Wireless Mouse", category: "MOUSE", quantity: 1, unitPriceINR: 5995 },
    { name: "Audio-Technica ATH-M40x Studio Headphones", category: "HEADPHONES", quantity: 1, unitPriceINR: 8999 },
  ];

  const handleCopyId = () => {
    navigator.clipboard.writeText(invoiceId);
    message.success(`Copied Invoice ID: ${invoiceId}`);
  };

  const handlePrint = () => {
    window.print();
  };

  const tableColumns = [
    {
      title: "Item Description & Specification",
      dataIndex: "name",
      key: "name",
      render: (text, record) => (
        <div>
          <div style={{ fontWeight: 600 }}>{text}</div>
          <Space size={4} style={{ marginTop: 2 }}>
            <Tag color="blue" style={{ fontSize: 10, padding: "0 4px" }}>{record.category || "HARDWARE"}</Tag>
            {record.brand && <Text type="secondary" style={{ fontSize: 11 }}>{record.brand}</Text>}
          </Space>
        </div>
      ),
    },
    {
      title: "Qty",
      dataIndex: "quantity",
      key: "quantity",
      width: 70,
      align: "center",
      render: (qty) => <strong>{qty || 1}</strong>,
    },
    {
      title: "Unit Price (INR)",
      dataIndex: "unitPriceINR",
      key: "unitPriceINR",
      width: 140,
      align: "right",
      render: (price) => (
        <span style={{ fontFamily: "var(--font-mono)" }}>
          ₹{Number(price || 0).toLocaleString("en-IN")}
        </span>
      ),
    },
    {
      title: "Line Total",
      key: "lineTotal",
      width: 150,
      align: "right",
      render: (_, record) => {
        const itemTotal = (Number(record.unitPriceINR || 0) + Number(record.shippingINR || 0)) * Number(record.quantity || 1);
        return (
          <strong style={{ fontFamily: "var(--font-mono)", color: "#0052FF" }}>
            ₹{itemTotal.toLocaleString("en-IN")}
          </strong>
        );
      },
    },
  ];

  return (
    <Modal
      open={open}
      onCancel={onClose}
      width={840}
      footer={[
        <Button key="copy" icon={<CopyOutlined />} onClick={handleCopyId}>
          Copy Invoice ID
        </Button>,
        <Button key="print" type="primary" icon={<PrinterOutlined />} onClick={handlePrint} style={{ background: "#0052FF" }}>
          Print / Save PDF
        </Button>,
        <Button key="close" onClick={onClose}>
          Close
        </Button>,
      ]}
      bodyStyle={{
        padding: 0,
        maxHeight: "80vh",
        overflowY: "auto",
      }}
      destroyOnClose
    >
      <div
        ref={invoiceRef}
        className="printable-invoice"
        style={{
          background: isDarkMode ? "#0b1329" : "#ffffff",
          color: isDarkMode ? "#f1f5f9" : "#0f172a",
          padding: "28px 32px",
          fontFamily: "var(--font-sans, -apple-system, BlinkMacSystemFont, sans-serif)",
        }}
      >
        {/* Top Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  background: "linear-gradient(135deg, #0052FF 0%, #00d2ff 100%)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#fff",
                  fontWeight: 900,
                  fontSize: 16,
                }}
              >
                P
              </div>
              <Title level={4} style={{ margin: 0, color: isDarkMode ? "#f1f5f9" : "#0f172a" }}>
                ProcureAI Enterprise
              </Title>
            </div>
            <Text type="secondary" style={{ fontSize: 12 }}>
              Autonomous Multi-Agent Procurement & Pay-on-Delivery Settlement
            </Text>
          </div>

          <div style={{ textAlign: "right" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 6, marginBottom: 4 }}>
              <Tag color="blue" icon={<SafetyCertificateOutlined />} style={{ padding: "2px 8px", fontSize: 12, fontWeight: 700 }}>
                PayPal Sandbox Secured
              </Tag>
              <Tag color="success" icon={<CheckCircleOutlined />} style={{ padding: "2px 8px", fontSize: 12, fontWeight: 700 }}>
                SETTLED
              </Tag>
            </div>
            <div style={{ fontSize: 12, color: "#94a3b8" }}>
              Official B2B Commercial Tax Invoice v2
            </div>
          </div>
        </div>

        {/* Invoice Metadata Box */}
        <Card
          style={{
            borderRadius: 12,
            marginBottom: 20,
            background: isDarkMode ? "rgba(15, 23, 42, 0.6)" : "#f8fafc",
            border: `1px solid ${isDarkMode ? "rgba(255, 255, 255, 0.08)" : "#e2e8f0"}`,
          }}
          bodyStyle={{ padding: "14px 18px" }}
        >
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12 }}>
            <div>
              <div style={{ fontSize: 11, color: "#94a3b8", textTransform: "uppercase", fontWeight: 700 }}>Invoice Number</div>
              <div style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: "#0052FF", fontSize: 14 }}>
                {invoiceId}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: "#94a3b8", textTransform: "uppercase", fontWeight: 700 }}>Issue Date</div>
              <div style={{ fontWeight: 600 }}>{new Date().toLocaleDateString("en-IN", { year: "numeric", month: "short", day: "numeric" })}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: "#94a3b8", textTransform: "uppercase", fontWeight: 700 }}>Associated Order ID</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>{orderId}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: "#94a3b8", textTransform: "uppercase", fontWeight: 700 }}>Mandate Authorization</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "#10b981" }}>
                {mandateId ? mandateId.slice(0, 18) + "..." : "Ed25519 Sealed"}
              </div>
            </div>
          </div>
        </Card>

        {/* Parties Two-Column */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 20 }}>
          <div
            style={{
              padding: 14,
              borderRadius: 10,
              background: isDarkMode ? "rgba(255, 255, 255, 0.02)" : "#ffffff",
              border: `1px solid ${isDarkMode ? "rgba(255, 255, 255, 0.05)" : "#f1f5f9"}`,
            }}
          >
            <Text type="secondary" style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase" }}>
              Supplier / Invoicer:
            </Text>
            <div style={{ fontWeight: 700, marginTop: 4 }}>ProcureAI Verified Supplier / Nehru Place Tech Hub</div>
            <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>GSTIN: 07AABCU9603R1ZM</div>
            <div style={{ fontSize: 12, color: "#94a3b8" }}>Email: sandbox-vendor@procureai.example.com</div>
            <div style={{ fontSize: 12, color: "#94a3b8" }}>New Delhi, Delhi 110019, India</div>
          </div>

          <div
            style={{
              padding: 14,
              borderRadius: 10,
              background: isDarkMode ? "rgba(255, 255, 255, 0.02)" : "#ffffff",
              border: `1px solid ${isDarkMode ? "rgba(255, 255, 255, 0.05)" : "#f1f5f9"}`,
            }}
          >
            <Text type="secondary" style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase" }}>
              Billed To (Enterprise Buyer):
            </Text>
            <div style={{ fontWeight: 700, marginTop: 4 }}>Corporate Procurement Executive</div>
            <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>Corporate Account ID: ACC-CORP-94021</div>
            <div style={{ fontSize: 12, color: "#94a3b8" }}>Email: buyer@example.com</div>
            <div style={{ fontSize: 12, color: "#94a3b8" }}>Bengaluru, Karnataka 560001, India</div>
          </div>
        </div>

        {/* Itemized Table */}
        <Table
          dataSource={items.map((it, idx) => ({ ...it, key: idx }))}
          columns={tableColumns}
          pagination={false}
          size="middle"
          style={{ marginBottom: 16 }}
        />

        {/* Financial Summary Breakdown */}
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
          <div style={{ width: 340 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 13 }}>
              <Text type="secondary">Hardware Items Subtotal:</Text>
              <strong style={{ fontFamily: "var(--font-mono)" }}>₹{totalINR.toLocaleString("en-IN")}</strong>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 13 }}>
              <Text type="secondary">Shipping & Logistics (SLA 7d):</Text>
              <Tag color="green" style={{ margin: 0 }}>FREE</Tag>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 13 }}>
              <Text type="secondary">Platform Guarantee Fee (1.5%):</Text>
              <span style={{ color: "#10b981", fontSize: 12 }}>Included in plan</span>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, fontSize: 13 }}>
              <Text type="secondary">Applicable GST / Taxes:</Text>
              <span style={{ fontSize: 12, color: "#94a3b8" }}>Included in price</span>
            </div>

            <Divider style={{ margin: "10px 0" }} />

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
              <Text strong style={{ fontSize: 15 }}>Total Settlement (INR):</Text>
              <strong style={{ fontFamily: "var(--font-mono)", fontSize: 18, color: "#0052FF" }}>
                ₹{totalINR.toLocaleString("en-IN")}
              </strong>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <Text type="secondary" style={{ fontSize: 12 }}>PayPal USD Equivalent:</Text>
              <strong style={{ fontFamily: "var(--font-mono)", fontSize: 14, color: "#10b981" }}>
                ${totalUSD} USD
              </strong>
            </div>
          </div>
        </div>

        {/* Cryptographic Seal & Verification Note */}
        <div
          style={{
            marginTop: 24,
            padding: 12,
            borderRadius: 8,
            background: isDarkMode ? "rgba(0, 82, 255, 0.08)" : "rgba(0, 82, 255, 0.04)",
            border: "1px dashed rgba(0, 82, 255, 0.3)",
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <SafetyCertificateOutlined style={{ fontSize: 24, color: "#0052FF" }} />
          <div style={{ fontSize: 11, color: isDarkMode ? "#cbd5e1" : "#475569" }}>
            <strong>Cryptographic Guarantee:</strong> This invoice corresponds to Ed25519 Mandate <code>{mandateId}</code>. Funds were captured from PayPal Sandbox Authorization and settled through ProcureAI smart disbursements upon verified delivery.
          </div>
        </div>
      </div>
    </Modal>
  );
}

