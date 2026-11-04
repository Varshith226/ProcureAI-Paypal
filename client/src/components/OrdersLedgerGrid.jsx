// client/src/components/OrdersLedgerGrid.jsx
import React, { useState, useEffect, useMemo, useRef } from "react";
import { AgGridReact } from "ag-grid-react";
import { Button, Input, Space, Tag, Typography, Card, Tooltip, message, Modal } from "antd";
import {
  DownloadOutlined,
  SearchOutlined,
  ReloadOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  LockOutlined,
  FileTextOutlined,
} from "@ant-design/icons";
import { fetchOrders } from "../api/paypalApi";

const { Text } = Typography;

export default function OrdersLedgerGrid({
  open,
  onClose,
  isDarkMode = true,
  onSelectOrder,
  onOpenInvoice,
}) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [quickFilterText, setQuickFilterText] = useState("");
  const gridRef = useRef();

  const isModalMode = open !== undefined;

  const loadOrders = async () => {
    setLoading(true);
    try {
      const data = await fetchOrders(100);
      setOrders(data);
    } catch (err) {
      console.warn("Could not fetch orders ledger:", err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isModalMode || open) {
      loadOrders();
    }
  }, [open]);

  const statusCellRenderer = (params) => {
    const status = params.value;
    switch (status) {
      case "AUTHORIZED":
        return <Tag color="processing" icon={<LockOutlined />}>AUTHORIZED (HOLD)</Tag>;
      case "CAPTURED":
        return <Tag color="success" icon={<CheckCircleOutlined />}>CAPTURED</Tag>;
      case "PARTIALLY_CAPTURED":
        return <Tag color="warning" icon={<CheckCircleOutlined />}>SLA ADJUSTED</Tag>;
      case "VENDOR_PAID":
        return <Tag color="green" icon={<CheckCircleOutlined />}>VENDOR PAID</Tag>;
      case "VOIDED":
        return <Tag color="error" icon={<CloseCircleOutlined />}>VOIDED</Tag>;
      case "APPROVED":
        return <Tag color="blue" icon={<ClockCircleOutlined />}>APPROVED</Tag>;
      default:
        return <Tag color="default">{status}</Tag>;
    }
  };

  const invoiceCellRenderer = (params) => {
    if (params.value) {
      return (
        <Tag
          color="cyan"
          icon={<FileTextOutlined />}
          style={{ cursor: "pointer", borderRadius: 4 }}
          onClick={() => {
            if (onOpenInvoice) {
              onOpenInvoice(params.data);
            } else {
              window.open(`/api/orders/${params.data.order_id}/invoice-view`, "_blank");
            }
          }}
        >
          {params.value.slice(0, 14)}...
        </Tag>
      );
    }
    return <Text type="secondary" style={{ fontSize: 11 }}>—</Text>;
  };

  const columnDefs = useMemo(() => [
    {
      headerName: "Order ID",
      field: "order_id",
      pinned: "left",
      width: 180,
      cellRenderer: (p) => (
        <Tooltip title="Click to view timeline">
          <span
            style={{ fontFamily: "var(--font-mono)", cursor: "pointer", fontWeight: 700, color: "#38bdf8" }}
            onClick={() => onSelectOrder && onSelectOrder(p.data)}
          >
            {p.value}
          </span>
        </Tooltip>
      ),
    },
    {
      headerName: "Lifecycle Status",
      field: "status",
      width: 190,
      cellRenderer: statusCellRenderer,
    },
    {
      headerName: "Settlement USD",
      field: "total_usd",
      width: 140,
      cellRenderer: (p) => (
        <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: "#10b981" }}>
          ${Number(p.value || 0).toFixed(2)} USD
        </span>
      ),
    },
    {
      headerName: "Plan Total INR",
      field: "total_inr",
      width: 140,
      cellRenderer: (p) => (
        <span style={{ fontFamily: "var(--font-mono)" }}>
          ₹{Number(p.value || 0).toLocaleString("en-IN")}
        </span>
      ),
    },
    {
      headerName: "Authorization ID",
      field: "authorization_id",
      width: 160,
      cellRenderer: (p) => p.value ? <Text code>{p.value.slice(0, 14)}...</Text> : <Text type="secondary">—</Text>,
    },
    {
      headerName: "Capture ID",
      field: "capture_id",
      width: 150,
      cellRenderer: (p) => p.value ? <Text code style={{ color: "#10b981" }}>{p.value.slice(0, 12)}...</Text> : <Text type="secondary">—</Text>,
    },
    {
      headerName: "PayPal Invoice",
      field: "invoice_id",
      width: 160,
      cellRenderer: invoiceCellRenderer,
    },
    {
      headerName: "Created",
      field: "created_at",
      width: 160,
      valueFormatter: (p) => p.value ? new Date(p.value).toLocaleString("en-IN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "",
    },
  ], [onSelectOrder, onOpenInvoice]);

  const defaultColDef = useMemo(() => ({
    sortable: true,
    filter: true,
    resizable: true,
  }), []);

  const onExportCsv = () => {
    if (gridRef.current?.api) {
      gridRef.current.api.exportDataAsCsv({ fileName: `procureai-orders-${Date.now()}.csv` });
      message.success("Exported Orders & Payments Ledger to CSV!");
    }
  };

  const gridContent = (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
        <Space align="center">
          <Text strong style={{ fontSize: 16 }}>
            📊 AG Grid: Orders & Payments Ledger
          </Text>
          <Tag color="blue">{orders.length} Records</Tag>
        </Space>
        <Space>
          <Input
            size="small"
            prefix={<SearchOutlined />}
            placeholder="Search orders..."
            value={quickFilterText}
            onChange={(e) => setQuickFilterText(e.target.value)}
            style={{ width: 180, borderRadius: 6 }}
          />
          <Button size="small" icon={<ReloadOutlined />} onClick={loadOrders} loading={loading} />
          <Button size="small" type="primary" icon={<DownloadOutlined />} onClick={onExportCsv} style={{ borderRadius: 6, background: "#0052FF" }}>
            Export CSV
          </Button>
        </Space>
      </div>

      <div className="ag-grid-responsive-container">
        <div
          className={isDarkMode ? "ag-theme-quartz-dark" : "ag-theme-quartz"}
          style={{ height: isModalMode ? 440 : 320, width: "100%", minWidth: 700, borderRadius: 8, overflow: "hidden" }}
        >
          <AgGridReact
            ref={gridRef}
            theme="legacy"
            rowData={orders}
            columnDefs={columnDefs}
            defaultColDef={defaultColDef}
            quickFilterText={quickFilterText}
            pagination={true}
            paginationPageSize={10}
          />
        </div>
      </div>
    </div>
  );

  if (isModalMode) {
    return (
      <Modal
        open={open}
        onCancel={onClose}
        width={1120}
        footer={null}
        destroyOnClose
        title={
          <Space align="center">
            <span style={{ fontSize: 16, fontWeight: 700 }}>📊 Enterprise Orders & Settlement Ledger (AG Grid)</span>
            <Tag color="blue">{orders.length} Synced Records</Tag>
          </Space>
        }
      >
        <div style={{ paddingTop: 8 }}>
          {gridContent}
        </div>
      </Modal>
    );
  }

  return (
    <Card
      style={{
        borderRadius: 16,
        marginBottom: 20,
        background: isDarkMode ? "rgba(15, 23, 42, 0.75)" : "#ffffff",
        border: `1px solid ${isDarkMode ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 82, 255, 0.15)"}`,
      }}
    >
      {gridContent}
    </Card>
  );
}
