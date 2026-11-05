// client/src/components/ApprovalPortalModal.jsx
import React, { useState } from "react";
import { Modal, Typography, Space, Tag, Button, Descriptions, Alert, message } from "antd";
import {
  CheckCircleOutlined,
  LockOutlined,
  AuditOutlined,
} from "@ant-design/icons";
import { consumeApprovalTokenApi } from "../api/paypalApi";

const { Text, Paragraph } = Typography;

export default function ApprovalPortalModal({
  open,
  onClose,
  plan,
  mandate,
  tokenRecord = null,
  onApprove,
  isDarkMode = true,
  inrPerUsd = 94.93,
}) {
  const [approving, setApproving] = useState(false);

  if (!plan) return null;

  const handleApprove = async () => {
    setApproving(true);
    try {
      if (tokenRecord?.token) {
        await consumeApprovalTokenApi(tokenRecord.token, {
          mandateId: mandate?.mandateId,
          planVersion: plan?.version || 1,
          approverId: "executive_cfo",
        });
      }
      if (onApprove) {
        await onApprove(tokenRecord);
      }
      message.success("Plan formally approved by authorized executive authority!");
      onClose();
    } catch (err) {
      message.error(`Approval failed: ${err.message}`);
    } finally {
      setApproving(false);
    }
  };

  const totalINR = plan.lockedTotalINR || 35492;
  const totalUSD = plan.lockedTotalUSD || (totalINR / (inrPerUsd || 94.93)).toFixed(2);
  const activeToken = tokenRecord?.token || "tok_appr_single_use";
  const expiresAtFormatted = tokenRecord?.expiresAt
    ? new Date(tokenRecord.expiresAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : "in 60 mins";

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      width={640}
      title={
        <Space align="center" wrap>
          <AuditOutlined style={{ color: "#0052FF" }} />
          <span style={{ fontWeight: 800 }}>Executive Finance Approval Portal</span>
          <Tag color="purple">Single-Use Token: {activeToken.slice(0, 16)}...</Tag>
        </Space>
      }
    >
      <Alert
        type="info"
        showIcon
        message="Cryptographic Approval Verification"
        description="This spending envelope requires executive approval. By approving, your authorization token is cryptographically bound to Plan Version 1 and expires immediately upon submission."
        style={{ marginBottom: 16, borderRadius: 10 }}
      />

      <Descriptions
        bordered
        size="small"
        column={1}
        style={{ marginBottom: 16 }}
      >
        <Descriptions.Item label="Order Plan ID">
          <Text code>{plan.planId || "PA-PLAN-1042"}</Text>
        </Descriptions.Item>
        <Descriptions.Item label="Strategy Key">
          <Tag color="blue">{plan.strategyKey || "BEST_VALUE"}</Tag>
        </Descriptions.Item>
        <Descriptions.Item label="Authorized Total (INR)">
          <Text strong style={{ color: "#0052FF" }}>
            ₹{Number(totalINR).toLocaleString("en-IN")}
          </Text>
        </Descriptions.Item>
        <Descriptions.Item label="PayPal Settlement (USD)">
          <Text strong style={{ color: "#0052FF" }}>
            ${totalUSD} USD
          </Text>
        </Descriptions.Item>
        <Descriptions.Item label="Single-Use Token">
          <Text code copyable>{activeToken}</Text>
        </Descriptions.Item>
        <Descriptions.Item label="Token Expiry">
          <Text type="secondary">{expiresAtFormatted}</Text>
        </Descriptions.Item>
      </Descriptions>

      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
        <Button onClick={onClose} style={{ borderRadius: 8 }}>
          Cancel
        </Button>
        <Button
          id="btn-cfo-approve-now"
          type="primary"
          icon={<CheckCircleOutlined />}
          loading={approving}
          onClick={handleApprove}
          style={{ borderRadius: 8, background: "#0052FF" }}
        >
          Sign & Approve Spending Envelope
        </Button>
      </div>
    </Modal>
  );
}
