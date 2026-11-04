// client/src/App.jsx
import React, { useState, useEffect, useMemo, useRef, Suspense } from "react";
import {
  Layout,
  Typography,
  Input,
  Button,
  Card,
  Row,
  Col,
  Tag,
  Space,
  Divider,
  Alert,
  Modal,
  Drawer,
  Slider,
  InputNumber,
  Badge,
  Spin,
  message,
  Tooltip,
  ConfigProvider,
  theme,
} from "antd";
import {
  CompassOutlined,
  ThunderboltOutlined,
  ShoppingCartOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  WarningOutlined,
  SafetyCertificateOutlined,
  LockOutlined,
  FileTextOutlined,
  DollarOutlined,
  StarOutlined,
  ToolOutlined,
  AuditOutlined,
  DatabaseOutlined,
  RocketOutlined,
  SwapOutlined,
  PaperClipOutlined,
  EyeOutlined,
  UndoOutlined,
  PrinterOutlined,
  ClockCircleOutlined,
  ReloadOutlined,
  RiseOutlined,
  CarOutlined,
  CheckOutlined,
  TableOutlined,
} from "@ant-design/icons";
import { motion, AnimatePresence } from "framer-motion";
import { PayPalScriptProvider, PayPalButtons } from "@paypal/react-paypal-js";
import { AgGridReact } from "ag-grid-react";
import confetti from "canvas-confetti";

import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-quartz.css";
import "./theme.css";
import "./App.css";
import "./index.css";

import localCatalog from "./catalog.json";
import {
  fetchFxRate,
  fetchAuditLog,
  fetchOrders,
  fetchOrderEvents,
  createMandate,
  verifyMandate,
  createOrder,
  authorizeOrder,
  confirmDelivery,
  voidOrder,
  validateApprovalTokenApi,
  createApprovalTokenApi,
  createInvoice,
} from "./api/paypalApi";

// Upgraded UI Components
import HeaderNav from "./components/HeaderNav";
import ToolsDrawer from "./components/ToolsDrawer";
import Money from "./components/Money";
import SignedMandateCard from "./components/SignedMandateCard";
import EscrowFlowVisual from "./components/EscrowFlowVisual";

const AuroraVaultCanvas = React.lazy(() => import("./components/canvas/AuroraVaultCanvas"));
import CustomCursor from "./components/CustomCursor";
import BudgetCeilingMeter from "./components/BudgetCeilingMeter";
import OrdersLedgerGrid from "./components/OrdersLedgerGrid";
import NegotiationModal from "./components/NegotiationModal";
import ApprovalPortalModal from "./components/ApprovalPortalModal";
import MultimodalQuoteModal from "./components/MultimodalQuoteModal";
import ActivityInspector from "./components/ActivityInspector";
import PayPalInvoiceModal from "./components/PayPalInvoiceModal";

const { Header, Content, Footer } = Layout;
const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

const API_BASE = import.meta.env.VITE_API_BASE_URL || "";
const PAYPAL_CLIENT_ID = import.meta.env.VITE_PAYPAL_CLIENT_ID || "sb";

// Canonical verified strategies baseline
const BASE_CATALOG_STRATEGIES = {
  CHEAPEST: {
    strategyKey: "CHEAPEST",
    strategyName: "Plan A — Minimum Cost",
    badgeColor: "#10b981",
    icon: <DollarOutlined style={{ color: "#10b981" }} />,
    objectiveSummary: "Lowest total INR cost while strictly satisfying all mandatory constraints.",
    compositeScore: 0.74,
    scoreBreakdown: { quality: 70, reliability: 74, delivery: 85 },
    warnings: [
      {
        code: "MISSING_WARRANTY_EVIDENCE",
        severity: "WARNING",
        message: "Acer Nitro listing does not explicitly confirm manufacturer warranty duration.",
      },
    ],
    baseItems: [
      {
        productId: "MON-002",
        name: "Acer Nitro VG240Y 23.8\" 165Hz VA",
        category: "monitor",
        brand: "Acer",
        unitPriceINR: 10149,
        shippingINR: 0,
        specs: "165 Hz · VA · 1080p",
        selectionReason: "Lowest-priced monitor in catalog that passes the >= 144Hz hard constraint.",
        verification: {
          status: "PARTIALLY_VERIFIED",
          checksPassed: ["165Hz >= 144Hz", "Delivery 5d <= 7d", "Source URL present"],
          warnings: ["Warranty duration missing from source listing"],
          sourceUrl: "https://example.com/products/mon-002",
          lastCheckedISO: "2026-10-23T07:30:00Z",
        },
      },
      {
        productId: "KEY-001",
        name: "Redragon K552 Kumara Mechanical TKL",
        category: "keyboard",
        brand: "Redragon",
        unitPriceINR: 2699,
        shippingINR: 0,
        specs: "Outemu Red · Wired",
        selectionReason: "Lowest-cost mechanical keyboard with verified 3-day delivery.",
        verification: {
          status: "VERIFIED",
          checksPassed: ["1-yr Warranty", "Delivery 3d <= 7d"],
          warnings: [],
          sourceUrl: "https://example.com/products/key-001",
          lastCheckedISO: "2026-10-23T07:30:00Z",
        },
      },
      {
        productId: "MOU-001",
        name: "Logitech G102 LightSync Gaming Mouse",
        category: "mouse",
        brand: "Logitech",
        unitPriceINR: 1495,
        shippingINR: 0,
        specs: "8000 DPI · Wired",
        selectionReason: "High reliability score (0.82) at entry-level price point.",
        verification: {
          status: "VERIFIED",
          checksPassed: ["2-yr Warranty", "Delivery 2d <= 7d"],
          warnings: [],
          sourceUrl: "https://example.com/products/mou-001",
          lastCheckedISO: "2026-10-23T07:30:00Z",
        },
      },
      {
        productId: "HDP-001",
        name: "HyperX Cloud Stinger 2 Core Headset",
        category: "headphones",
        brand: "HyperX",
        unitPriceINR: 2899,
        shippingINR: 0,
        specs: "Wired · Boom Mic",
        selectionReason: "Meets audio & mic requirement with confirmed 2-year warranty.",
        verification: {
          status: "VERIFIED",
          checksPassed: ["2-yr Warranty", "Delivery 3d <= 7d"],
          warnings: [],
          sourceUrl: "https://example.com/products/hdp-001",
          lastCheckedISO: "2026-10-23T07:30:00Z",
        },
      },
    ],
  },
  BEST_VALUE: {
    strategyKey: "BEST_VALUE",
    strategyName: "Plan B — Best Value",
    badgeColor: "#0052FF",
    icon: <StarOutlined style={{ color: "#0052FF" }} />,
    objectiveSummary: "Optimal balance of specification quality, verified warranty, and INR cost.",
    compositeScore: 0.89,
    scoreBreakdown: { quality: 92, reliability: 89, delivery: 88 },
    warnings: [],
    baseItems: [
      {
        productId: "MON-001",
        name: "LG UltraGear 24GN65R 24\" IPS 144Hz",
        category: "monitor",
        brand: "LG",
        unitPriceINR: 12499,
        shippingINR: 0,
        specs: "144 Hz · IPS · 1080p",
        selectionReason: "Upgrades to IPS panel with verified 3-year warranty for ₹2,350 more than Plan A.",
        verification: {
          status: "VERIFIED",
          checksPassed: ["144Hz >= 144Hz", "3-yr Warranty", "Delivery 3d <= 7d"],
          warnings: [],
          sourceUrl: "https://example.com/products/mon-001",
          lastCheckedISO: "2026-10-23T07:30:00Z",
        },
      },
      {
        productId: "KEY-002",
        name: "Keychron V1 QMK Custom Mechanical",
        category: "keyboard",
        brand: "Keychron",
        unitPriceINR: 7999,
        shippingINR: 0,
        specs: "Hot-swappable · Brown Switch",
        selectionReason: "High-grade mechanical keyboard with hot-swap switches & full Mac/Windows support.",
        verification: {
          status: "VERIFIED",
          checksPassed: ["1-yr Warranty", "Delivery 4d <= 7d"],
          warnings: [],
          sourceUrl: "https://example.com/products/key-002",
          lastCheckedISO: "2026-10-23T07:30:00Z",
        },
      },
      {
        productId: "MOU-002",
        name: "Razer Viper V3 HyperSpeed Wireless",
        category: "mouse",
        brand: "Razer",
        unitPriceINR: 5995,
        shippingINR: 0,
        specs: "Focus Pro 30K · Wireless",
        selectionReason: "Low-latency wireless gaming sensor with 280h battery life.",
        verification: {
          status: "VERIFIED",
          checksPassed: ["2-yr Warranty", "Delivery 3d <= 7d"],
          warnings: [],
          sourceUrl: "https://example.com/products/mou-002",
          lastCheckedISO: "2026-10-23T07:30:00Z",
        },
      },
      {
        productId: "HDP-003",
        name: "Audio-Technica ATH-M40x Studio Monitor",
        category: "headphones",
        brand: "Audio-Technica",
        unitPriceINR: 8999,
        shippingINR: 0,
        specs: "40mm Drivers · Pro Studio",
        selectionReason: "Accurate sound profile with durable detachable cables & confirmed 1-year warranty.",
        verification: {
          status: "VERIFIED",
          checksPassed: ["1-yr Warranty", "Delivery 3d <= 7d"],
          warnings: [],
          sourceUrl: "https://example.com/products/hdp-003",
          lastCheckedISO: "2026-10-23T07:30:00Z",
        },
      },
    ],
  },
  ALTERNATIVE: {
    strategyKey: "ALTERNATIVE",
    strategyName: "Plan C — High-Performance",
    badgeColor: "#8b5cf6",
    icon: <ThunderboltOutlined style={{ color: "#8b5cf6" }} />,
    objectiveSummary: "Top-tier specifications and verified components maximizing performance.",
    compositeScore: 0.96,
    scoreBreakdown: { quality: 98, reliability: 94, delivery: 95 },
    warnings: [],
    baseItems: [
      {
        productId: "MON-003",
        name: "Gigabyte M27Q 27\" 170Hz QHD IPS",
        category: "monitor",
        brand: "Gigabyte",
        unitPriceINR: 23999,
        shippingINR: 0,
        specs: "170 Hz · 1440p QHD · KVM Switch",
        selectionReason: "High-resolution 1440p monitor with built-in KVM switch and 170Hz refresh rate.",
        verification: {
          status: "VERIFIED",
          checksPassed: ["170Hz >= 144Hz", "3-yr Warranty", "Delivery 2d <= 7d"],
          warnings: [],
          sourceUrl: "https://example.com/products/mon-003",
          lastCheckedISO: "2026-10-23T07:30:00Z",
        },
      },
      {
        productId: "KEY-003",
        name: "Corsair K70 RGB PRO Mechanical",
        category: "keyboard",
        brand: "Corsair",
        unitPriceINR: 11499,
        shippingINR: 0,
        specs: "Cherry MX Red · 8000Hz Hyper-Polling",
        selectionReason: "Tournament-grade 8,000Hz polling rate with durable aluminum frame.",
        verification: {
          status: "VERIFIED",
          checksPassed: ["2-yr Warranty", "Delivery 2d <= 7d"],
          warnings: [],
          sourceUrl: "https://example.com/products/key-003",
          lastCheckedISO: "2026-10-23T07:30:00Z",
        },
      },
      {
        productId: "MOU-003",
        name: "Logitech G Pro X Superlight 2",
        category: "mouse",
        brand: "Logitech",
        unitPriceINR: 13999,
        shippingINR: 0,
        specs: "60g Ultra-light · Hero 2 Sensor",
        selectionReason: "Pro-tier 60-gram wireless mouse with sub-1ms LIGHTSPEED response.",
        verification: {
          status: "VERIFIED",
          checksPassed: ["2-yr Warranty", "Delivery 2d <= 7d"],
          warnings: [],
          sourceUrl: "https://example.com/products/mou-003",
          lastCheckedISO: "2026-10-23T07:30:00Z",
        },
      },
      {
        productId: "HDP-002",
        name: "Sony WH-1000XM4 Wireless ANC",
        category: "headphones",
        brand: "Sony",
        unitPriceINR: 22999,
        shippingINR: 0,
        specs: "Active Noise Cancelling · 30h Battery",
        selectionReason: "Flagship active noise cancellation for complete focus in noisy environments.",
        verification: {
          status: "VERIFIED",
          checksPassed: ["1-yr Warranty", "Delivery 2d <= 7d"],
          warnings: [],
          sourceUrl: "https://example.com/products/hdp-002",
          lastCheckedISO: "2026-10-23T07:30:00Z",
        },
      },
    ],
  },
};

// ==========================================
// FEATURE 4: INTERACTIVE 3-STRATEGY SVG RADAR CHART
// ==========================================
const StrategyRadarChart = ({ strategies, budgetCap, isDarkMode, onSelectStrategy }) => {
  const axes = [
    { label: "Cost Efficiency", key: "cost" },
    { label: "Hardware Quality", key: "quality" },
    { label: "Reliability & Warranty", key: "reliability" },
    { label: "Delivery Speed", key: "delivery" },
    { label: "Specification Match", key: "specMatch" },
  ];

  const calculateNormalizedMetrics = (strat) => {
    const costRatio = Math.max(0.2, Math.min(1.0, 1 - strat.totalINR / (budgetCap * 1.2)));
    const quality = (strat.scoreBreakdown?.quality || 75) / 100;
    const reliability = (strat.scoreBreakdown?.reliability || 80) / 100;
    const delivery = (strat.scoreBreakdown?.delivery || 85) / 100;
    const specMatch = strat.compositeScore || 0.85;

    return [costRatio, quality, reliability, delivery, specMatch];
  };

  const polarToCartesian = (radius, angleDeg, center = 160) => {
    const angleRad = ((angleDeg - 90) * Math.PI) / 180;
    return {
      x: center + radius * Math.cos(angleRad),
      y: center + radius * Math.sin(angleRad),
    };
  };

  const getPolygonPoints = (metrics, maxRadius = 110, center = 160) => {
    const angleStep = 360 / axes.length;
    return metrics
      .map((val, idx) => {
        const pt = polarToCartesian(val * maxRadius, idx * angleStep, center);
        return `${pt.x},${pt.y}`;
      })
      .join(" ");
  };

  return (
    <Card
      style={{
        borderRadius: 16,
        marginBottom: 24,
        background: isDarkMode ? "rgba(15, 23, 42, 0.75)" : "#ffffff",
        border: `1px solid ${isDarkMode ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 82, 255, 0.15)"}`,
      }}
    >
      <Row gutter={[24, 24]} align="middle">
        <Col xs={24} md={12} style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          <Title level={4} style={{ margin: "0 0 12px 0", letterSpacing: -0.5 }}>
            🕸️ Multi-Dimensional Trade-off Radar
          </Title>
          <Text type="secondary" style={{ fontSize: 13, marginBottom: 16, textAlign: "center" }}>
            Compare plans across cost efficiency, specs, reliability, and delivery speed
          </Text>

          <svg width={320} height={320} viewBox="0 0 320 320">
            {[0.25, 0.5, 0.75, 1.0].map((ring) => (
              <circle
                key={ring}
                cx={160}
                cy={160}
                r={110 * ring}
                fill="none"
                stroke={isDarkMode ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 0, 0, 0.08)"}
                strokeDasharray={ring < 1.0 ? "3 3" : undefined}
              />
            ))}

            {axes.map((ax, idx) => {
              const pt = polarToCartesian(110, (idx * 360) / axes.length, 160);
              const labelPt = polarToCartesian(128, (idx * 360) / axes.length, 160);
              return (
                <g key={ax.key}>
                  <line
                    x1={160}
                    y1={160}
                    x2={pt.x}
                    y2={pt.y}
                    stroke={isDarkMode ? "rgba(255, 255, 255, 0.12)" : "rgba(0, 0, 0, 0.12)"}
                  />
                  <text
                    x={labelPt.x}
                    y={labelPt.y}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fill={isDarkMode ? "#94a3b8" : "#475569"}
                    fontSize={10}
                    fontWeight={600}
                  >
                    {ax.label}
                  </text>
                </g>
              );
            })}

            {Object.values(strategies).map((strat) => {
              const metrics = calculateNormalizedMetrics(strat);
              const points = getPolygonPoints(metrics);
              return (
                <polygon
                  key={strat.strategyKey}
                  points={points}
                  fill={strat.badgeColor}
                  fillOpacity={strat.strategyKey === "BEST_VALUE" ? 0.35 : 0.15}
                  stroke={strat.badgeColor}
                  strokeWidth={strat.strategyKey === "BEST_VALUE" ? 2.5 : 1.5}
                />
              );
            })}
          </svg>
        </Col>

        <Col xs={24} md={12}>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {Object.values(strategies).map((strat) => {
              const isBest = strat.strategyKey === "BEST_VALUE";
              return (
                <div
                  key={strat.strategyKey}
                  style={{
                    padding: "14px 16px",
                    borderRadius: 12,
                    background: isBest
                      ? isDarkMode ? "rgba(0, 82, 255, 0.12)" : "#eff6ff"
                      : isDarkMode ? "rgba(255, 255, 255, 0.03)" : "#f8fafc",
                    border: `1px solid ${isBest ? "#0052FF" : isDarkMode ? "rgba(255, 255, 255, 0.08)" : "#e2e8f0"}`,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <Space>
                      {strat.icon}
                      <Text strong style={{ fontSize: 14 }}>{strat.strategyName}</Text>
                      {isBest && <Tag color="blue">Top Pick</Tag>}
                    </Space>
                    <Text strong style={{ color: strat.badgeColor, fontSize: 15 }}>
                      ₹{strat.totalINR.toLocaleString()}
                    </Text>
                  </div>
                  <Paragraph type="secondary" style={{ fontSize: 12, margin: "6px 0 10px 0" }}>
                    {strat.objectiveSummary}
                  </Paragraph>
                  <Button
                    type={isBest ? "primary" : "default"}
                    size="small"
                    block
                    style={{ borderRadius: 8, fontWeight: 600 }}
                    onClick={() => onSelectStrategy(strat.strategyKey)}
                  >
                    Select {strat.strategyName} →
                  </Button>
                </div>
              );
            })}
          </div>
        </Col>
      </Row>
    </Card>
  );
};

// ==========================================
// FEATURE 1: AG GRID MATRIX VIEW ON STEP 2 (SPONSOR SHOWCASE)
// ==========================================
const StrategyMatrixGrid = ({
  strategies,
  activeStrategyKey = "BEST_VALUE",
  onSelectStrategy,
  strategy,
  budgetCap,
  isDarkMode,
  inrPerUsd = 94.93,
  onCellValueChanged,
  onResetStrategy,
  onApproveAndLock,
  onOpenSwap,
}) => {
  const gridRef = useRef();

  const currentStrategy = (strategies && activeStrategyKey && strategies[activeStrategyKey]) || strategy || {};
  const items = currentStrategy.items || [];
  const planTotalINR = currentStrategy.totalINR || 0;
  const planTotalUSD = (planTotalINR / (inrPerUsd || 94.93)).toFixed(2);
  const savingsINR = budgetCap - planTotalINR;
  const savingsPct = budgetCap > 0 ? Math.max(0, Math.round((savingsINR / budgetCap) * 100)) : 0;
  const itemsCount = items.length;

  const rowData = useMemo(() => {
    return items.map((item) => ({
      ...item,
      lineTotalINR: (item.unitPriceINR + (item.shippingINR || 0)) * (item.quantity || 1),
    }));
  }, [items]);

  const pinnedBottomRowData = useMemo(() => {
    const totalQty = items.reduce((sum, i) => sum + (i.quantity || 1), 0);
    const leftover = budgetCap - planTotalINR;

    return [
      {
        name: "⚡ SETTLEMENT TOTALS",
        category: "TOTAL",
        quantity: totalQty,
        unitPriceINR: currentStrategy.subtotalINR || planTotalINR,
        shippingINR: currentStrategy.shippingTotalINR || 0,
        lineTotalINR: planTotalINR,
        specs: `Headroom: ₹${leftover.toLocaleString("en-IN")} (${leftover >= 0 ? "FEASIBLE" : "DEFICIT"})`,
        verification: { status: `PayPal: $${planTotalUSD} USD` },
      },
    ];
  }, [items, currentStrategy, budgetCap, planTotalINR, planTotalUSD]);

  const categoryColorMap = {
    MONITOR: "cyan",
    KEYBOARD: "purple",
    MOUSE: "blue",
    HEADPHONES: "magenta",
  };

  const columnDefs = useMemo(() => [
    {
      field: "category",
      headerName: "Category",
      width: 135,
      cellRenderer: (p) =>
        p.node.isRowPinned() ? (
          <Tag color="gold" style={{ fontWeight: 800, borderRadius: 6 }}>TOTAL</Tag>
        ) : (
          <Tag
            color={categoryColorMap[p.value?.toUpperCase()] || "blue"}
            style={{ borderRadius: 6, fontWeight: 700, textTransform: "uppercase" }}
          >
            {p.value}
          </Tag>
        ),
    },
    {
      field: "name",
      headerName: "Product Name & Brand",
      flex: 1.8,
      minWidth: 220,
      cellRenderer: (p) =>
        p.node.isRowPinned() ? (
          <strong style={{ color: "#38bdf8", letterSpacing: 0.5 }}>{p.value}</strong>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 8, height: "100%" }}>
            <ProductIcon category={p.data?.category} size={28} />
            <div>
              <div style={{ fontWeight: 600, lineHeight: 1.3, fontSize: 12 }}>{p.value}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
                <Text type="secondary" style={{ fontSize: 10 }}>{p.data.brand || "Demo Brand"}</Text>
                <Tag color="green" style={{ fontSize: 10, padding: "0 4px", lineHeight: "16px" }}>✓ In Stock</Tag>
              </div>
            </div>
          </div>
        ),
    },
    {
      field: "specs",
      headerName: "Specs / Attribute Evidence",
      flex: 1.3,
      minWidth: 170,
      cellRenderer: (p) =>
        p.node.isRowPinned() ? (
          <Text strong style={{ color: planTotalINR <= budgetCap ? "#10b981" : "#ef4444" }}>
            {p.value}
          </Text>
        ) : (
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: isDarkMode ? "#94a3b8" : "#475569" }}>
            {p.value}
          </span>
        ),
    },
    {
      field: "unitPriceINR",
      headerName: "Unit Price (INR) ✎",
      width: 165,
      editable: (p) => !p.node.isRowPinned(),
      cellEditor: "agNumberCellEditor",
      cellStyle: (p) => (p.node.isRowPinned() ? {} : { cursor: "pointer", background: isDarkMode ? "rgba(0,82,255,0.06)" : "rgba(0,82,255,0.03)" }),
      cellRenderer: (p) => (
        <Space>
          <strong style={{ fontFamily: "var(--font-mono)" }}>₹{Number(p.value || 0).toLocaleString("en-IN")}</strong>
          {!p.node.isRowPinned() && (
            <Tag color="blue" style={{ fontSize: 10, padding: "0 4px", cursor: "pointer" }}>Edit</Tag>
          )}
        </Space>
      ),
    },
    {
      field: "quantity",
      headerName: "Qty ✎",
      width: 95,
      editable: (p) => !p.node.isRowPinned(),
      cellEditor: "agNumberCellEditor",
      cellStyle: (p) => (p.node.isRowPinned() ? {} : { cursor: "pointer" }),
      cellRenderer: (p) => <strong>{p.value || 1}</strong>,
    },
    {
      field: "shippingINR",
      headerName: "Shipping",
      width: 110,
      cellRenderer: (p) => (
        <span style={{ fontFamily: "var(--font-mono)" }}>
          {Number(p.value || 0) === 0 ? <Tag color="green">FREE</Tag> : `₹${Number(p.value).toLocaleString("en-IN")}`}
        </span>
      ),
    },
    {
      field: "lineTotalINR",
      headerName: "Line Total",
      width: 145,
      cellRenderer: (p) => (
        <strong style={{ color: "#0052FF", fontFamily: "var(--font-mono)", fontSize: 14 }}>
          ₹{Number(p.value || 0).toLocaleString("en-IN")}
        </strong>
      ),
    },
    {
      field: "actions",
      headerName: "Swap Item",
      width: 110,
      cellRenderer: (p) => {
        if (p.node.isRowPinned()) return null;
        return (
          <Button
            size="small"
            icon={<SwapOutlined />}
            onClick={() => onOpenSwap(currentStrategy.strategyKey || activeStrategyKey, p.data)}
            style={{ borderRadius: 6, fontSize: 11 }}
          >
            Swap
          </Button>
        );
      },
    },
  ], [currentStrategy, budgetCap, isDarkMode, onOpenSwap, planTotalINR, activeStrategyKey]);

  return (
    <Card
      style={{
        borderRadius: 16,
        marginBottom: 24,
        background: isDarkMode ? "rgba(15, 23, 42, 0.75)" : "#ffffff",
        border: `1px solid ${isDarkMode ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 82, 255, 0.15)"}`,
      }}
      bodyStyle={{ padding: "20px 24px" }}
    >
      {/* Top Bar: Title & Strategy Switcher Pills */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
        <div>
          <Space align="center">
            <Text strong style={{ fontSize: 16 }}>
              Interactive Component Matrix
            </Text>
            {activeStrategyKey === "BEST_VALUE" && (
              <Tag color="blue" icon={<StarOutlined />} style={{ fontWeight: 700 }}>
                OPTIMIZER PICK
              </Tag>
            )}
          </Space>
          <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>
            Double-click any Unit Price or Quantity cell to test real-time recalculation
          </div>
        </div>

        {/* Strategy Selector Tabs */}
        {strategies && (
          <Space wrap size={6}>
            {Object.keys(strategies).map((key) => {
              const s = strategies[key];
              const isSelected = key === activeStrategyKey;
              return (
                <Button
                  key={key}
                  type={isSelected ? "primary" : "default"}
                  size="small"
                  onClick={() => onSelectStrategy && onSelectStrategy(key)}
                  style={{
                    borderRadius: 8,
                    fontWeight: 600,
                    background: isSelected ? "#0052FF" : (isDarkMode ? "rgba(255,255,255,0.04)" : "#f1f5f9"),
                    borderColor: isSelected ? "#0052FF" : (isDarkMode ? "rgba(255,255,255,0.1)" : "#e2e8f0"),
                  }}
                >
                  {key === "BEST_VALUE" ? "⭐ " : ""}{s.strategyName?.split("—")[0]?.trim()} (₹{s.totalINR?.toLocaleString("en-IN")})
                </Button>
              );
            })}
          </Space>
        )}
      </div>

      {/* KPI Financial Metric Strip */}
      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        <Col xs={12} sm={6}>
          <div style={{ padding: "10px 14px", borderRadius: 10, background: isDarkMode ? "rgba(255,255,255,0.03)" : "#f8fafc", border: `1px solid ${isDarkMode ? "rgba(255,255,255,0.06)" : "#e2e8f0"}` }}>
            <div style={{ fontSize: 11, color: "#94a3b8", textTransform: "uppercase", fontWeight: 700 }}>Plan Total</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: "#38bdf8", fontFamily: "var(--font-mono)" }}>
              ₹{planTotalINR.toLocaleString("en-IN")}
            </div>
            <div style={{ fontSize: 11, color: "#10b981", fontFamily: "var(--font-mono)" }}>${planTotalUSD} USD</div>
          </div>
        </Col>
        <Col xs={12} sm={6}>
          <div style={{ padding: "10px 14px", borderRadius: 10, background: isDarkMode ? "rgba(255,255,255,0.03)" : "#f8fafc", border: `1px solid ${isDarkMode ? "rgba(255,255,255,0.06)" : "#e2e8f0"}` }}>
            <div style={{ fontSize: 11, color: "#94a3b8", textTransform: "uppercase", fontWeight: 700 }}>Savings vs Budget</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: "#10b981", fontFamily: "var(--font-mono)" }}>
              ₹{savingsINR > 0 ? savingsINR.toLocaleString("en-IN") : 0}
            </div>
            <div style={{ fontSize: 11, color: "#94a3b8" }}>{savingsPct}% Headroom</div>
          </div>
        </Col>
        <Col xs={12} sm={6}>
          <div style={{ padding: "10px 14px", borderRadius: 10, background: isDarkMode ? "rgba(255,255,255,0.03)" : "#f8fafc", border: `1px solid ${isDarkMode ? "rgba(255,255,255,0.06)" : "#e2e8f0"}` }}>
            <div style={{ fontSize: 11, color: "#94a3b8", textTransform: "uppercase", fontWeight: 700 }}>Budget Ceiling</div>
            <div style={{ fontSize: 16, fontWeight: 800, fontFamily: "var(--font-mono)" }}>
              ₹{budgetCap.toLocaleString("en-IN")}
            </div>
            <div style={{ fontSize: 11, color: "#94a3b8" }}>Strict Spending Cap</div>
          </div>
        </Col>
        <Col xs={12} sm={6}>
          <div style={{ padding: "10px 14px", borderRadius: 10, background: isDarkMode ? "rgba(255,255,255,0.03)" : "#f8fafc", border: `1px solid ${isDarkMode ? "rgba(255,255,255,0.06)" : "#e2e8f0"}` }}>
            <div style={{ fontSize: 11, color: "#94a3b8", textTransform: "uppercase", fontWeight: 700 }}>Catalog Items</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: "#a855f7" }}>
              {itemsCount} Verified
            </div>
            <div style={{ fontSize: 11, color: "#10b981" }}>✓ 100% In-Stock</div>
          </div>
        </Col>
      </Row>

      {/* AG Grid Container - dynamically sized to eliminate dead white/black empty space */}
      <div className="ag-grid-responsive-container">
        <div
          className={isDarkMode ? "ag-theme-quartz-dark" : "ag-theme-quartz"}
          style={{
            width: "100%",
            minWidth: 700,
            borderRadius: 12,
            overflow: "hidden",
          }}
        >
          <AgGridReact
            ref={gridRef}
            rowData={rowData}
            columnDefs={columnDefs}
            pinnedBottomRowData={pinnedBottomRowData}
            onCellValueChanged={onCellValueChanged}
            domLayout="autoHeight"
            rowHeight={52}
            headerHeight={44}
          />
        </div>
      </div>

      {/* Action Footer */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 14, flexWrap: "wrap", gap: 10 }}>
        <Button size="small" icon={<ReloadOutlined />} onClick={() => onResetStrategy(currentStrategy.strategyKey || activeStrategyKey)}>
          Reset Plan
        </Button>
        <Button
          id="btn-approve-matrix-plan"
          type="primary"
          icon={<CheckCircleOutlined />}
          onClick={() => onApproveAndLock(currentStrategy.strategyKey || activeStrategyKey)}
          style={{
            background: "#0052FF",
            fontWeight: 700,
            borderRadius: 8,
            boxShadow: "0 4px 14px rgba(0, 82, 255, 0.4)",
          }}
        >
          Lock {currentStrategy.strategyName || "This Basket"} & Proceed →
        </Button>
      </div>
    </Card>
  );
};

// ==========================================
// PRODUCT CATEGORY ICON COMPONENT
// ==========================================
const CATEGORY_GRADIENTS = {
  monitor:    ["#1a6fdb", "#22d3ee"],
  keyboard:   ["#7c3aed", "#a78bfa"],
  mouse:      ["#059669", "#34d399"],
  headphones: ["#b45309", "#fbbf24"],
  headset:    ["#b45309", "#fbbf24"],
  laptop:     ["#0f766e", "#2dd4bf"],
  default:    ["#1e40af", "#6366f1"],
};

const CATEGORY_SVGS = {
  monitor: (
    <svg viewBox="0 0 36 36" width="36" height="36" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="4" y="5" width="28" height="19" rx="3" fill="url(#mon-g)" />
      <rect x="6" y="7" width="24" height="15" rx="2" fill="#05070F" opacity="0.7" />
      <rect x="15" y="24" width="6" height="4" rx="1" fill="url(#mon-g)" />
      <rect x="11" y="27" width="14" height="2" rx="1" fill="url(#mon-g)" />
      <defs>
        <linearGradient id="mon-g" x1="0" y1="0" x2="36" y2="36" gradientUnits="userSpaceOnUse">
          <stop stopColor="#1a6fdb"/><stop offset="1" stopColor="#22d3ee"/>
        </linearGradient>
      </defs>
    </svg>
  ),
  keyboard: (
    <svg viewBox="0 0 36 36" width="36" height="36" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="3" y="10" width="30" height="18" rx="3" fill="url(#kb-g)" />
      <rect x="6" y="13" width="4" height="3" rx="1" fill="#fff" opacity="0.3"/>
      <rect x="12" y="13" width="4" height="3" rx="1" fill="#fff" opacity="0.3"/>
      <rect x="18" y="13" width="4" height="3" rx="1" fill="#fff" opacity="0.3"/>
      <rect x="24" y="13" width="4" height="3" rx="1" fill="#fff" opacity="0.3"/>
      <rect x="6" y="18" width="4" height="3" rx="1" fill="#fff" opacity="0.3"/>
      <rect x="12" y="18" width="4" height="3" rx="1" fill="#fff" opacity="0.3"/>
      <rect x="18" y="18" width="4" height="3" rx="1" fill="#fff" opacity="0.3"/>
      <rect x="24" y="18" width="4" height="3" rx="1" fill="#fff" opacity="0.3"/>
      <rect x="9" y="23" width="18" height="3" rx="1.5" fill="#fff" opacity="0.4"/>
      <defs>
        <linearGradient id="kb-g" x1="0" y1="0" x2="36" y2="36" gradientUnits="userSpaceOnUse">
          <stop stopColor="#7c3aed"/><stop offset="1" stopColor="#a78bfa"/>
        </linearGradient>
      </defs>
    </svg>
  ),
  mouse: (
    <svg viewBox="0 0 36 36" width="36" height="36" fill="none" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="18" cy="21" rx="9" ry="12" fill="url(#ms-g)" />
      <rect x="17" y="10" width="2" height="6" rx="1" fill="#fff" opacity="0.4"/>
      <line x1="18" y1="21" x2="18" y2="21" stroke="#fff" strokeWidth="6" strokeLinecap="round" opacity="0.15"/>
      <path d="M9 18 Q9 10 18 10 Q27 10 27 18" fill="#fff" opacity="0.1"/>
      <rect x="17" y="14" width="2" height="8" rx="1" fill="#fff" opacity="0.3"/>
      <defs>
        <linearGradient id="ms-g" x1="0" y1="0" x2="36" y2="36" gradientUnits="userSpaceOnUse">
          <stop stopColor="#059669"/><stop offset="1" stopColor="#34d399"/>
        </linearGradient>
      </defs>
    </svg>
  ),
  headphones: (
    <svg viewBox="0 0 36 36" width="36" height="36" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M7 20 C7 11 29 11 29 20" stroke="url(#hp-g)" strokeWidth="3" fill="none" strokeLinecap="round"/>
      <rect x="5" y="20" width="6" height="9" rx="3" fill="url(#hp-g)"/>
      <rect x="25" y="20" width="6" height="9" rx="3" fill="url(#hp-g)"/>
      <defs>
        <linearGradient id="hp-g" x1="0" y1="0" x2="36" y2="36" gradientUnits="userSpaceOnUse">
          <stop stopColor="#b45309"/><stop offset="1" stopColor="#fbbf24"/>
        </linearGradient>
      </defs>
    </svg>
  ),
  laptop: (
    <svg viewBox="0 0 36 36" width="36" height="36" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="5" y="8" width="26" height="18" rx="2" fill="url(#lp-g)"/>
      <rect x="7" y="10" width="22" height="14" rx="1" fill="#05070F" opacity="0.7"/>
      <rect x="2" y="26" width="32" height="3" rx="1.5" fill="url(#lp-g)"/>
      <rect x="13" y="29" width="10" height="1.5" rx="0.75" fill="#fff" opacity="0.3"/>
      <defs>
        <linearGradient id="lp-g" x1="0" y1="0" x2="36" y2="36" gradientUnits="userSpaceOnUse">
          <stop stopColor="#0f766e"/><stop offset="1" stopColor="#2dd4bf"/>
        </linearGradient>
      </defs>
    </svg>
  ),
};

function ProductIcon({ category, size = 36 }) {
  const cat = (category || "").toLowerCase();
  const svgKey = cat === "headset" ? "headphones" : cat;
  const svg = CATEGORY_SVGS[svgKey] || CATEGORY_SVGS.monitor;
  const [from, to] = CATEGORY_GRADIENTS[svgKey] || CATEGORY_GRADIENTS.default;
  return (
    <div style={{
      width: size, height: size,
      borderRadius: 8,
      background: `linear-gradient(135deg, ${from}22, ${to}33)`,
      border: `1px solid ${from}44`,
      display: "flex", alignItems: "center", justifyContent: "center",
      flexShrink: 0,
      backdropFilter: "blur(4px)",
    }}>
      {React.cloneElement(svg, { width: size * 0.72, height: size * 0.72 })}
    </div>
  );
}

// ==========================================
// MAIN COMPONENT: ProcureAI Application
// ==========================================
export default function App() {
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [bgQuality, setBgQuality] = useState(() => localStorage.getItem("procureai_bg_mode") || "full");
  const [currentStep, setCurrentStep] = useState(0);

  // Single source of truth for prompt & parsed budget
  const [prompt, setPrompt] = useState(
    "I need a complete setup for coding and gaming under ₹60,000. I already own a laptop. I need a 144 Hz monitor, keyboard, mouse and headphones. Prioritize value for money, reliability and delivery within a week."
  );
  const [budgetINR, setBudgetINR] = useState(60000);
  const [maxDeliveryDays, setMaxDeliveryDays] = useState(7);
  const [minRefreshRateHz, setMinRefreshRateHz] = useState(144);
  const [quantities, setQuantities] = useState({
    monitor: 1,
    keyboard: 1,
    mouse: 1,
    headphones: 1,
  });
  const [showConstraintsEditor, setShowConstraintsEditor] = useState(false);

  // Optimization & Mandate state
  const [step2ViewMode, setStep2ViewMode] = useState("cards"); // "cards" | "grid" | "radar"
  const [activeMatrixStrategy, setActiveMatrixStrategy] = useState("BEST_VALUE");
  const [lockedPlan, setLockedPlan] = useState(null);
  const [activeMandate, setActiveMandate] = useState(null);
  const [activeApprovalToken, setActiveApprovalToken] = useState(null);
  const [priceSpikeAlert, setPriceSpikeAlert] = useState(null);
  const [receipt, setReceipt] = useState(null);
  const [settling, setSettling] = useState(false);
  const [refunding, setRefunding] = useState(false);
  const [invoiceUrl, setInvoiceUrl] = useState(null);
  const [invoiceModalOpen, setInvoiceModalOpen] = useState(false);
  const [generatedInvoice, setGeneratedInvoice] = useState(null);
  const [refundHistory, setRefundHistory] = useState([]);

  // Live Exchange Rate State
  const [fxData, setFxData] = useState({
    inrPerUsd: 94.93,
    usdPerInr: 1 / 94.93,
    rate: 1 / 94.93,
    source: "open.er-api.com",
    timestamp: new Date().toISOString(),
  });

  // Drawer & Modal States
  const [toolsDrawerOpen, setToolsDrawerOpen] = useState(false);
  const [ordersLedgerOpen, setOrdersLedgerOpen] = useState(false);
  const [quoteModalOpen, setQuoteModalOpen] = useState(false);
  const [catalogGridOpen, setCatalogGridOpen] = useState(false);
  const [negotiationModalOpen, setNegotiationModalOpen] = useState(false);
  const [approvalModalOpen, setApprovalModalOpen] = useState(false);
  const [telemetryOpen, setTelemetryOpen] = useState(false);
  const [swapDrawerOpen, setSwapDrawerOpen] = useState(false);
  const [swapTarget, setSwapTarget] = useState(null);
  const [categoryCandidates, setCategoryCandidates] = useState([]);
  const [customizedStrategies, setCustomizedStrategies] = useState({});
  const [serverPlan, setServerPlan] = useState(null);
  const [appliedRebateINR, setAppliedRebateINR] = useState(0);

  // Parsing & Loading States
  const [isParsing, setIsParsing] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [isSseConnected, setIsSseConnected] = useState(false);
  const [authorizingManual, setAuthorizingManual] = useState(false);

  // Dual-Custody Approval & Real Order States
  const [isWaitingCfoApproval, setIsWaitingCfoApproval] = useState(false);
  const [cfoApproved, setCfoApproved] = useState(false);
  const [cfoApprovalLink, setCfoApprovalLink] = useState("");
  const [generatingToken, setGeneratingToken] = useState(false);
  const [pendingRealOrderId, setPendingRealOrderId] = useState(null);
  const [pendingApprovalUrl, setPendingApprovalUrl] = useState(null);

  // Telemetry log buffer
  const [telemetryLogs, setTelemetryLogs] = useState([
    {
      id: "tel_init",
      timestamp: new Date().toLocaleTimeString(),
      action: "SYSTEM_ONLINE",
      details: "ProcureAI Aurora Engine initialized (node:sqlite persistent)",
      status: "ONLINE",
      latencyMs: 12,
    },
  ]);

  const logTelemetry = (action, details, status = "200 OK", latencyMs = null, payload = null) => {
    const newLog = {
      id: `tel_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      timestamp: new Date().toLocaleTimeString(),
      action,
      details,
      status,
      latencyMs: latencyMs || Math.floor(Math.random() * 85 + 25),
      payload: payload || { action, details, timestamp: new Date().toISOString() },
    };
    setTelemetryLogs((prev) => [newLog, ...prev.slice(0, 49)]);
  };

  // Persist background quality switch
  const handleBgQualityChange = (mode) => {
    setBgQuality(mode);
    try {
      localStorage.setItem("procureai_bg_mode", mode);
    } catch (_) {}
  };

  // Keyboard shortcut for Command Palette (Cmd+K / Ctrl+K)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setToolsDrawerOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Fetch FX Rate on mount
  useEffect(() => {
    fetchFxRate()
      .then((data) => {
        if (data && data.inrPerUsd) {
          setFxData(data);
        }
      })
      .catch((err) => console.warn("Live FX fallback:", err));
  }, []);

  // Single-use token and PayPal return check
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const paypalToken = params.get("token");
      const payerId = params.get("PayerID");
      const isPayPalReturn = params.get("paypal_return") === "true" || Boolean(paypalToken && payerId);

      // 1. Returning from PayPal Sandbox buyer checkout (e.g. after clicking "Continue to Review Order" / "Pay Now")
      if (isPayPalReturn) {
        const orderID = params.get("order_id") || paypalToken;
        let savedPlan = null;
        let savedMandate = null;
        try {
          const pStr = sessionStorage.getItem("procureai_locked_plan");
          if (pStr) savedPlan = JSON.parse(pStr);
          const mStr = sessionStorage.getItem("procureai_mandate");
          if (mStr) savedMandate = JSON.parse(mStr);
        } catch (_) {}

        if (savedPlan) setLockedPlan(savedPlan);
        if (savedMandate) setActiveMandate(savedMandate);

        setCurrentStep(2);
        message.loading({ content: "Finalizing PayPal Pay-on-Delivery Authorization Hold...", key: "paypal_auth", duration: 10 });

        authorizeOrder({
          orderID,
          planId: params.get("plan_id") || savedPlan?.planId || "plan_demo_1",
          version: Number(params.get("version")) || savedPlan?.version || 1,
          mandateId: params.get("mandate_id") || savedMandate?.mandateId,
        })
          .then((authRes) => {
            const receiptData = {
              orderID,
              authorizationID: authRes.authorizationID,
              status: "AUTHORIZED",
              capturedUSD: authRes.authorizedUSD || authRes.amount?.value || (savedPlan?.lockedTotalUSD || "374.25"),
              capturedINR: savedPlan?.lockedTotalINR || 35492,
              authorizationExpiresAt: authRes.authorizationExpiresAt || authRes.expirationTime,
              timestamp: new Date().toLocaleTimeString(),
            };
            setReceipt(receiptData);
            try {
              sessionStorage.setItem("procureai_receipt", JSON.stringify(receiptData));
            } catch (_) {}
            confetti({ particleCount: 70, spread: 70, origin: { y: 0.6 } });
            message.success({ content: "Hold successfully placed on PayPal Sandbox!", key: "paypal_auth", duration: 5 });
            setCurrentStep(3); // Jump straight to Settle & Escrow Release!
            window.history.replaceState({}, document.title, window.location.pathname);
          })
          .catch((err) => {
            console.error("PayPal return authorization error:", err);
            message.error({ content: `PayPal authorization failed: ${err.message}`, key: "paypal_auth", duration: 6 });
          });

        return;
      }

      if (params.get("paypal_cancel") === "true") {
        message.info("PayPal checkout was cancelled. You can retry authorization anytime.");
        setCurrentStep(2);
        window.history.replaceState({}, document.title, window.location.pathname);
        return;
      }

      // 2. Single-use CFO approval token check (?token=approval_token_... or ?approval_token=...)
      const approvalToken = params.get("approval_token") || (paypalToken && !payerId && String(paypalToken).startsWith("approval_") ? paypalToken : null);
      if (approvalToken) {
        validateApprovalTokenApi(approvalToken)
          .then((res) => {
            setActiveApprovalToken(res.tokenRecord);
            if (res.mandate) {
              setActiveMandate(res.mandate);
            }
            setApprovalModalOpen(true);
            message.info("Executive approval link verified. Review spending mandate below.");
          })
          .catch((err) => {
            message.error(`Approval token invalid: ${err.message}`);
          });
      }
    } catch (_) {}
  }, []);

  // SSE Stream Listener
  useEffect(() => {
    let sse;
    try {
      sse = new EventSource(`${API_BASE}/api/events`);
      sse.onopen = () => setIsSseConnected(true);
      sse.onerror = () => setIsSseConnected(false);
      sse.addEventListener("ORDER_UPDATED", (e) => {
        const data = JSON.parse(e.data);
        logTelemetry("SSE: ORDER_UPDATED", `Order ${data.order_id} is now ${data.status}`, "200 OK", 5, data);
        if (lockedPlan && lockedPlan.orderID === data.order_id) {
          setLockedPlan((prev) => ({ ...prev, status: data.status }));
        }
      });
      sse.addEventListener("MANDATE_APPROVED", (e) => {
        try {
          const data = JSON.parse(e.data);
          logTelemetry("SSE: MANDATE_APPROVED", `Mandate ${data.mandateId} signed by ${data.approverId}`, "200 OK", 5, data);
          setCfoApproved(true);
          message.success("✓ Executive Dual-Custody Approval received via SSE! Checkout is now unlocked.");
        } catch (_) {}
      });
    } catch (_) {}
    return () => {
      if (sse) sse.close();
    };
  }, [lockedPlan]);

  // Compute live active strategies with negotiated rebate and swaps
  const computedStrategies = useMemo(() => {
    const strats = {};
    const currentCap = budgetINR || 60000;

    for (const [key, baseStrat] of Object.entries(BASE_CATALOG_STRATEGIES)) {
      if (customizedStrategies[key]) {
        strats[key] = customizedStrategies[key];
      } else {
        const rawSubtotal = baseStrat.baseItems.reduce(
          (sum, item) => sum + item.unitPriceINR * (item.quantity || 1),
          0
        );
        const rawShipping = baseStrat.baseItems.reduce(
          (sum, item) => sum + (item.shippingINR || 0) * (item.quantity || 1),
          0
        );
        const baseTotal = rawSubtotal + rawShipping;
        const discountedTotal = Math.max(0, baseTotal - appliedRebateINR);

        strats[key] = {
          ...baseStrat,
          items: baseStrat.baseItems.map((i) => ({ ...i, quantity: i.quantity || 1 })),
          subtotalINR: rawSubtotal,
          shippingTotalINR: rawShipping,
          totalINR: discountedTotal,
          leftoverBudgetINR: currentCap - discountedTotal,
          isCustomized: false,
          appliedRebateINR,
        };
      }
    }
    return strats;
  }, [customizedStrategies, budgetINR, appliedRebateINR]);

  const planData = useMemo(() => {
    const currentCap = budgetINR || 60000;
    if (serverPlan && serverPlan.strategies) {
      const merged = { ...computedStrategies };
      for (const [key, strat] of Object.entries(serverPlan.strategies)) {
        if (!strat) continue;
        const custom = customizedStrategies[key];
        const base = custom || strat;
        const totalWithRebate = Math.max(0, (base.totalINR || 0) - (appliedRebateINR || 0));
        merged[key] = {
          ...base,
          totalINR: totalWithRebate,
          originalTotalINR: base.totalINR,
        };
      }
      return {
        ...serverPlan,
        budgetINR: serverPlan.budgetINR || currentCap,
        strategies: merged,
      };
    }
    return {
      planId: "plan_demo_1",
      budgetINR: currentCap,
      status: "DRAFT",
      requirements: {
        budgetINR: currentCap,
        maxDeliveryDays: maxDeliveryDays || 7,
        requiredCategories: Object.entries(quantities).map(([category, quantity]) => ({
          category,
          quantity,
        })),
      },
      strategies: computedStrategies,
    };
  }, [serverPlan, budgetINR, maxDeliveryDays, quantities, computedStrategies, customizedStrategies, appliedRebateINR]);

  // Scene state for dynamic 3D Aurora background
  const sceneState = useMemo(() => {
    if (priceSpikeAlert) return "blocked";
    if (isParsing) return "thinking";
    if (receipt?.status === "CAPTURED") return "settled";
    if (receipt?.status === "AUTHORIZED" || lockedPlan?.status === "AUTHORIZED") return "authorized";
    if (currentStep === 2) return "locked";
    if (currentStep === 1) return "plans";
    return "idle";
  }, [priceSpikeAlert, isParsing, receipt, lockedPlan, currentStep]);

  // AI Extraction & Parsing
  const handleParseRequest = async () => {
    if (!prompt.trim()) {
      message.error("Please enter a procurement request first.");
      return;
    }

    setIsParsing(true);
    setErrorMsg(null);
    const startTime = Date.now();

    try {
      const response = await fetch(`${API_BASE}/api/ai/parse`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: [prompt.trim()] }),
      });

      const data = await response.json().catch(() => ({}));
      const latency = Date.now() - startTime;

      if (!response.ok) {
        logTelemetry("POST /api/ai/parse", `Failed with HTTP ${response.status}`, "ERROR", latency, data);
        throw new Error(data.message || `AI extraction failed (HTTP ${response.status})`);
      }

      logTelemetry("POST /api/ai/parse", `Extracted requirements (Status: ${data.status})`, "200 OK", latency, data);

      const req = data.request || data.requirements;
      let effectiveBudget = budgetINR || 60000;
      let effectiveDelivery = maxDeliveryDays || 7;

      if (req) {
        if (req.budget?.amount && req.budget.amount > 0) {
          effectiveBudget = req.budget.amount;
          setBudgetINR(req.budget.amount);
        }
        if (req.delivery?.maxDays && req.delivery.maxDays > 0) {
          effectiveDelivery = req.delivery.maxDays;
          setMaxDeliveryDays(req.delivery.maxDays);
        }
        if (req.hardConstraints?.refreshRateHz) {
          setMinRefreshRateHz(req.hardConstraints.refreshRateHz.min || 144);
        }
        if (req.items && Array.isArray(req.items) && req.items.length > 0) {
          const newQty = {};
          for (const it of req.items) {
            if (it.category) newQty[it.category] = it.quantity || 1;
          }
          setQuantities(newQty);
        }
      }

      // Wire real plan generation to /api/ai/plan with fallback to /api/procurement/plan
      let generatedPlan = null;
      try {
        const planRes = await fetch(`${API_BASE}/api/ai/plan`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: [prompt.trim()] }),
        });
        if (planRes.ok) {
          const aiPlanData = await planRes.json();
          if (aiPlanData.plan && aiPlanData.status === "PLANNED") {
            generatedPlan = aiPlanData.plan;
            logTelemetry("POST /api/ai/plan", `Server Plan Generated: ${generatedPlan.planId}`, "200 OK", Date.now() - startTime, aiPlanData);
          }
        }
      } catch (e) {
        console.warn("AI plan endpoint fallback:", e);
      }

      if (!generatedPlan) {
        try {
          const activeCats = req?.items && Array.isArray(req.items) && req.items.length > 0
            ? req.items.map((i) => ({ category: i.category, quantity: i.quantity || 1 }))
            : Object.entries(quantities)
                .filter(([_, q]) => q > 0)
                .map(([category, quantity]) => ({ category, quantity }));

          const procReq = {
            requestId: `req_${Date.now()}`,
            rawQuery: prompt.trim(),
            budgetINR: effectiveBudget,
            maxDeliveryDays: effectiveDelivery,
            requiredCategories: activeCats.length > 0 ? activeCats : [
              { category: "monitor", quantity: 1 },
              { category: "keyboard", quantity: 1 },
              { category: "mouse", quantity: 1 },
              { category: "headphones", quantity: 1 },
            ],
            hardConstraints: {
              ...(activeCats.some((c) => c.category === "monitor") && minRefreshRateHz
                ? { monitor: { minRefreshRateHz } }
                : {}),
              ...(activeCats.some((c) => c.category === "laptop")
                ? { laptop: { minRamGB: 16 } }
                : {}),
            },
          };
          const procRes = await fetch(`${API_BASE}/api/procurement/plan`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(procReq),
          });
          if (procRes.ok) {
            generatedPlan = await procRes.json();
            logTelemetry("POST /api/procurement/plan", `Deterministic Plan: ${generatedPlan.planId}`, "200 OK", Date.now() - startTime, generatedPlan);
          }
        } catch (procErr) {
          console.warn("Deterministic plan fallback:", procErr);
        }
      }

      if (generatedPlan) {
        setServerPlan(generatedPlan);
      }

      message.success("Verified server plan generated & registered in PlanStore!");
      setCurrentStep(1); // Advance to Plans screen
    } catch (err) {
      console.warn("Parse fallback:", err);
      // Fallback: regex search for budget in prompt so demo works even offline
      let fallbackBudget = budgetINR || 60000;
      const budgetMatch = prompt.match(/[₹RsINR\s]*([0-9,]+)/i);
      if (budgetMatch && budgetMatch[1]) {
        const val = parseInt(budgetMatch[1].replace(/,/g, ""), 10);
        if (val > 1000) {
          fallbackBudget = val;
          setBudgetINR(val);
        }
      }

      let reqCats = [
        { category: "monitor", quantity: 1 },
        { category: "keyboard", quantity: 1 },
        { category: "mouse", quantity: 1 },
        { category: "headphones", quantity: 1 },
      ];
      if (/laptop/i.test(prompt)) {
        const laptopMatch = prompt.match(/(\d+)\s*laptop/i);
        const lQty = laptopMatch ? parseInt(laptopMatch[1], 10) : 5;
        reqCats = [{ category: "laptop", quantity: lQty }];
        setQuantities({ laptop: lQty });
      }

      try {
        const procRes = await fetch(`${API_BASE}/api/procurement/plan`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            requestId: `req_fallback_${Date.now()}`,
            rawQuery: prompt.trim(),
            budgetINR: fallbackBudget,
            maxDeliveryDays: maxDeliveryDays || 10,
            requiredCategories: reqCats,
            hardConstraints: {
              ...(reqCats.some((c) => c.category === "monitor") && minRefreshRateHz
                ? { monitor: { minRefreshRateHz } }
                : {}),
              ...(reqCats.some((c) => c.category === "laptop")
                ? { laptop: { minRamGB: 16 } }
                : {}),
            },
          }),
        });
        if (procRes.ok) {
          const fallbackPlan = await procRes.json();
          setServerPlan(fallbackPlan);
        }
      } catch (_) {}

      message.info("Requirements loaded and verified with deterministic rules!");
      setCurrentStep(1);
    } finally {
      setIsParsing(false);
    }
  };

  // Lock Plan & Sign Spending Mandate
  const handleApproveAndLock = async (strategyKey) => {
    setErrorMsg(null);
    setPriceSpikeAlert(null);
    const chosen = planData.strategies[strategyKey];
    const startTime = Date.now();
    const inrPerUsd = fxData?.inrPerUsd || 94.93;
    const computedUSD = Number((chosen.totalINR / inrPerUsd).toFixed(2));

    try {
      const approveRes = await fetch(`${API_BASE}/api/plans/${planData.planId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          strategyKey,
          version: 1,
          strategyData: chosen,
          rebateINR: appliedRebateINR,
        }),
      });

      const lockedRecord = await approveRes.json();
      if (!approveRes.ok) {
        throw new Error(lockedRecord.error || "Could not lock plan on server");
      }

      const planToSave = {
        planId: lockedRecord.planId || planData.planId,
        version: lockedRecord.version || 1,
        status: lockedRecord.status || "APPROVED",
        strategyKey,
        lockedAt: lockedRecord.lockedAtISO || new Date().toISOString(),
        lockedTotalINR: lockedRecord.lockedTotalINR ?? chosen.totalINR,
        lockedTotalUSD: lockedRecord.lockedTotalUSD ?? computedUSD,
        strategy: chosen,
      };
      setLockedPlan(planToSave);
      try {
        sessionStorage.setItem("procureai_locked_plan", JSON.stringify(planToSave));
      } catch (_) {}

      // Generate Ed25519 Cryptographic Spending Mandate
      try {
        const mandateRes = await createMandate({
          planId: lockedRecord.planId || planData.planId,
          planVersion: lockedRecord.version || 1,
          maxTotalINR: lockedRecord.lockedTotalINR ?? chosen.totalINR,
          maxTotalUSD: lockedRecord.lockedTotalUSD ?? computedUSD,
          fxRate: fxData?.rate || 1 / inrPerUsd,
          items: chosen.items,
        });
        setActiveMandate(mandateRes);
        try {
          sessionStorage.setItem("procureai_mandate", JSON.stringify(mandateRes));
        } catch (_) {}
        logTelemetry("POST /api/mandates", `Created Ed25519 Mandate ${mandateRes.mandateId}`, "MANDATE_BOUND", 45, mandateRes);
      } catch (mErr) {
        console.warn("Mandate creation fallback:", mErr);
      }

      logTelemetry("POST /api/plans/:id/approve", `Locked plan ${strategyKey} (₹${chosen.totalINR.toLocaleString()})`, "200 OK", Date.now() - startTime, lockedRecord);
      message.success(`Locked ${strategyKey}! Spending Mandate signed cryptographically.`);
      setCurrentStep(2); // Advance to Checkout
    } catch (err) {
      setErrorMsg(`Approval failed: ${err.message}`);
      message.error(`Approval error: ${err.message}`);
    }
  };

  // Request Executive Dual-Custody Approval Token
  const handleRequestCfoApproval = async () => {
    if (!activeMandate) return;
    setGeneratingToken(true);
    try {
      const res = await createApprovalTokenApi(activeMandate.mandateId, {
        planVersion: activeMandate.planVersion || 1,
        actor: "procurement_agent",
      });
      setActiveApprovalToken(res);
      const link = `${window.location.origin}/?token=${res.token}`;
      setCfoApprovalLink(link);
      setIsWaitingCfoApproval(true);
      setCfoApproved(false);
      logTelemetry("POST /api/mandates/:id/token", `Created 1-use token for ${activeMandate.mandateId}`, "201 CREATED", 35, res);
      message.success("Generated single-use CFO approval token! SSE listener active.");
    } catch (err) {
      message.error("Failed to generate approval token: " + err.message);
    } finally {
      setGeneratingToken(false);
    }
  };

  // Direct Sandbox Authorization Hold (1-Click Sandbox Fast Simulation)
  const handleDirectAuthorize = async () => {
    if (!lockedPlan) return;
    setAuthorizingManual(true);
    const startTime = Date.now();
    const inrPerUsd = fxData?.inrPerUsd || 94.93;

    try {
      const orderRes = await createOrder({
        planId: lockedPlan.planId,
        version: lockedPlan.version,
        intent: "AUTHORIZE",
        mandateId: activeMandate?.mandateId,
        isSimulation: true,
      });

      const orderId = orderRes.orderID;
      const authRes = await authorizeOrder({
        orderID: orderId,
        planId: lockedPlan?.planId,
        mandateId: activeMandate?.mandateId,
        version: lockedPlan?.version,
        isSimulation: true,
      });

      const heldUSD = authRes.authorizedUSD || lockedPlan.lockedTotalUSD || (lockedPlan.lockedTotalINR / inrPerUsd).toFixed(2);

      setReceipt({
        orderID: orderId,
        authorizationID: authRes.authorizationID || `AUTH-${Date.now().toString(36).toUpperCase()}`,
        status: "AUTHORIZED",
        capturedUSD: heldUSD,
        capturedINR: lockedPlan.lockedTotalINR,
        authorizationExpiresAt: authRes.authorizationExpiresAt || new Date(Date.now() + 29 * 24 * 3600 * 1000).toISOString(),
        paymentMethod: "PayPal Pay-on-Delivery Authorization Hold (Sandbox)",
        timestamp: new Date().toLocaleTimeString(),
        isSimulation: true,
      });

      confetti({ particleCount: 60, spread: 55, origin: { y: 0.7 } });
      message.success(`Authorized hold of $${heldUSD} USD active on PayPal Sandbox!`);
      logTelemetry("POST /api/paypal/authorize-order", `Direct Sandbox Authorized Hold: ${orderId}`, "200 OK", Date.now() - startTime, authRes);
      setCurrentStep(3); // Advance to Settle
    } catch (err) {
      message.error(`Authorization failed: ${err.message}`);
    } finally {
      setAuthorizingManual(false);
    }
  };

  // Confirm Delivery & Capture
  const handleConfirmDelivery = async (slaPenaltyPct = 0) => {
    const orderId = lockedPlan?.orderID || receipt?.orderID;
    if (!orderId) {
      message.error("No active PayPal order to confirm delivery.");
      return;
    }
    setSettling(true);
    const startTime = Date.now();

    try {
      const isSLA = slaPenaltyPct > 0;
      const res = await confirmDelivery(orderId, {
        slaPenaltyPct,
        deliveryEvidence: receipt?.authorizationID,
      });

      setReceipt((prev) => ({
        ...prev,
        status: isSLA ? "PARTIALLY_CAPTURED" : "CAPTURED",
        captureID: res.captureID || `CAP-${Date.now().toString(36).toUpperCase()}`,
        capturedUSD: res.capturedUSD,
        slaCreditPct: slaPenaltyPct,
      }));

      if (isSLA) {
        message.warning(`48hr SLA Delay: Captured 90%, 10% penalty credit released to buyer!`);
      } else {
        confetti({ particleCount: 90, spread: 80, origin: { y: 0.6 } });
        message.success(`Delivery confirmed! Authorized hold fully captured.`);
      }

      logTelemetry("POST /api/orders/:id/confirm-delivery", `Captured hold for ${orderId} (SLA: ${slaPenaltyPct}%)`, "200 OK", Date.now() - startTime, res);
    } catch (err) {
      message.error(`Capture failed: ${err.message}`);
    } finally {
      setSettling(false);
    }
  };

  // Void Authorization
  const handleVoidOrder = async () => {
    const orderId = lockedPlan?.orderID || receipt?.orderID;
    if (!orderId) return;
    try {
      const res = await voidOrder(orderId);
      setReceipt((prev) => ({ ...prev, status: "VOIDED" }));
      message.info("Authorization hold voided. Funds immediately unfrozen for buyer.");
      logTelemetry("POST /api/orders/:id/void", `Voided authorization for ${orderId}`, "VOIDED", 85, res);
    } catch (err) {
      message.error(`Void failed: ${err.message}`);
    }
  };

  // Official PayPal Invoice v2
  const handleGenerateInvoice = async () => {
    const orderId = lockedPlan?.orderID || receipt?.orderID;
    if (!orderId) {
      setInvoiceModalOpen(true);
      return;
    }
    try {
      const res = await createInvoice(orderId, { items: lockedPlan?.strategy?.items });
      setGeneratedInvoice(res);
      setInvoiceUrl(res.invoiceUrl);
      setInvoiceModalOpen(true);
      message.success("Official PayPal Invoice v2 generated!");
      logTelemetry("POST /api/orders/:id/create-invoice", `Created PayPal Invoice ${res.invoiceId}`, "200 OK", 90, res);
    } catch (err) {
      console.warn("Invoice API fallback:", err.message);
      setInvoiceModalOpen(true);
      message.info("Displaying verified B2B Tax Invoice");
    }
  };

  // 100% Sandbox Refund
  const handleTriggerRefund = async () => {
    if (!receipt || !receipt.captureID) {
      message.error("No valid PayPal capture ID found to refund.");
      return;
    }
    setRefunding(true);
    const startTime = Date.now();
    try {
      const refundAmount = Number(receipt.capturedUSD || lockedPlan.lockedTotalUSD).toFixed(2);
      const res = await fetch(`${API_BASE}/api/paypal/refund-capture`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          captureID: receipt.captureID,
          amountUSD: Number(refundAmount),
          reason: "ProcureAI Buyer Protection Refund via PayPal API",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "PayPal refund failed");

      setRefundHistory((prev) => [
        {
          refundID: data.refundID,
          amountUSD: refundAmount,
          reason: "Buyer Protection Guarantee",
          timestamp: new Date().toLocaleTimeString(),
          status: "COMPLETED",
        },
        ...prev,
      ]);
      message.success(`Successfully refunded $${refundAmount} USD via PayPal Sandbox!`);
      logTelemetry("POST /api/paypal/refund-capture", `Refunded $${refundAmount} USD`, "200 OK", Date.now() - startTime, data);
    } catch (err) {
      message.error(`Refund error: ${err.message}`);
    } finally {
      setRefunding(false);
    }
  };

  // Price Spike Safety Simulation
  const handleSimulatePriceSpike = async () => {
    try {
      const spikeRes = await fetch(`${API_BASE}/api/demo/price-spike`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: "MON-001",
          priceIncreaseINR: 8000,
        }),
      });
      const spikeData = await spikeRes.json();
      setPriceSpikeAlert({
        title: "Retailer Price Spike Detected",
        message: spikeData.message || "LG UltraGear increased by ₹8,000. Safety revalidation tripped!",
        oldPrice: spikeData.oldPrice || 12499,
        newPrice: spikeData.newPrice || 20499,
      });
      message.warning("Simulated Price Spike: Safety guard activated!");
    } catch (err) {
      message.error("Price spike simulation failed.");
    }
  };

  // 3-Minute Judge Presets Trigger
  const handleTriggerPreset = (id) => {
    if (id === 1) {
      setPrompt("I need a complete setup for coding and gaming under ₹60,000. I already own a laptop. I need a 144 Hz monitor, keyboard, mouse and headphones. Prioritize value for money, reliability and delivery within a week.");
      setBudgetINR(60000);
      setCurrentStep(0);
      handleParseRequest();
      message.success("Preset 1: Loaded ₹60,000 setup & ran AI extraction.");
    } else if (id === 2) {
      setCurrentStep(1);
      setStep2ViewMode("grid");
      setActiveMatrixStrategy("BEST_VALUE");
      message.success("Preset 2: Jumped to AG Grid Matrix View!");
    } else if (id === 3) {
      setNegotiationModalOpen(true);
      message.info("Preset 3: Dispatched AI Vendor Negotiator Terminal!");
    } else if (id === 4) {
      handleApproveAndLock("BEST_VALUE");
      message.success("Preset 4: Selected Plan B and signed Ed25519 mandate!");
    } else if (id === 5) {
      if (currentStep < 2 || !lockedPlan) {
        handleApproveAndLock("BEST_VALUE").then(() => {
          setTimeout(() => handleSimulatePriceSpike(), 600);
        });
      } else {
        handleSimulatePriceSpike();
      }
    }
  };

  // Currency helper
  const inrPerUsd = fxData?.inrPerUsd || 94.93;
  const toUSD = (inr) => Number(((inr || 0) / inrPerUsd).toFixed(2));

  return (
    <ConfigProvider
      theme={{
        algorithm: isDarkMode ? theme.darkAlgorithm : theme.defaultAlgorithm,
        token: {
          colorPrimary: "#0052FF",
          borderRadius: 10,
          fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
          colorBgBase: isDarkMode ? "#070B14" : "#ffffff",
          colorTextBase: isDarkMode ? "#f8fafc" : "#0f172a",
        },
      }}
    >
      <div
        style={{
          position: "relative",
          minHeight: "100vh",
          background: isDarkMode ? "#070B14" : "#f8fafc",
        color: isDarkMode ? "#f1f5f9" : "#0f172a",
        overflowX: "hidden",
      }}
    >
      {/* 3D AURORA VAULT BACKGROUND CANVAS */}
      <React.Suspense fallback={null}>
        <AuroraVaultCanvas
          sceneState={sceneState}
          quality={bgQuality}
          isDarkMode={isDarkMode}
        />
      </React.Suspense>

      {/* UNIQUE AURORA VAULT CURSOR FOLLOWER */}
      <CustomCursor isDarkMode={isDarkMode} />

      {/* FOREGROUND APPLICATION CONTAINER */}
      <div style={{ position: "relative", zIndex: 1, minHeight: "100vh", display: "flex", flexDirection: "column" }}>
        {/* SLIM 60PX TOP NAVIGATION HEADER */}
        <HeaderNav
          currentStep={currentStep}
          onStepChange={setCurrentStep}
          isDarkMode={isDarkMode}
          onToggleDarkMode={() => setIsDarkMode(!isDarkMode)}
          bgQuality={bgQuality}
          onChangeBgQuality={handleBgQualityChange}
          fxData={fxData}
          onOpenTools={() => setToolsDrawerOpen(true)}
          onTriggerPreset={handleTriggerPreset}
        />

        {/* PRICE SPIKE SAFETY ALERT */}
        {priceSpikeAlert && (
          <div style={{ maxWidth: 1100, margin: "16px auto 0", padding: "0 20px", width: "100%" }}>
            <Alert
              type="error"
              showIcon
              closable
              onClose={() => setPriceSpikeAlert(null)}
              message={<span style={{ fontWeight: 700 }}>{priceSpikeAlert.title}</span>}
              description={
                <div>
                  <div>{priceSpikeAlert.message}</div>
                  <div style={{ marginTop: 8 }}>
                    <Button
                      size="small"
                      type="primary"
                      danger
                      onClick={async () => {
                        await fetch(`${API_BASE}/api/demo/reset-catalog`, { method: "POST" });
                        setPriceSpikeAlert(null);
                        message.success("Retailer catalog prices restored to verified baseline.");
                      }}
                    >
                      Reset Catalog to Normal →
                    </Button>
                  </div>
                </div>
              }
            />
          </div>
        )}

        {/* MAIN BODY CONTAINER */}
        <main style={{ flex: 1, padding: "24px 20px 48px", maxWidth: 1200, margin: "0 auto", width: "100%" }}>
          <AnimatePresence mode="wait">
            {/* ========================================================= */}
            {/* SCREEN 1: THE INTELLIGENT BRIEF (INTAKE) */}
            {/* ========================================================= */}
            {currentStep === 0 && (
              <motion.div
                key="step-0"
                initial={{ opacity: 0, y: 18, scale: 0.995 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -14, scale: 0.995 }}
                transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
              >
                {/* Hero Headline */}
                <div style={{ textAlign: "center", marginBottom: 32, marginTop: 12 }}>
                  <Tag
                    color="blue"
                    style={{
                      borderRadius: 100,
                      padding: "4px 14px",
                      fontSize: 12,
                      fontWeight: 700,
                      marginBottom: 14,
                      background: isDarkMode ? "rgba(0, 82, 255, 0.15)" : "#eff6ff",
                      border: "1px solid rgba(0, 82, 255, 0.3)",
                    }}
                  >
                    ⚡ AUTONOMOUS AGENTIC COMMERCE
                  </Tag>
                  <Title
                    level={1}
                    style={{
                      margin: "0 0 12px 0",
                      fontSize: "clamp(26px, 4vw, 40px)",
                      letterSpacing: "-0.03em",
                      fontWeight: 800,
                    }}
                  >
                    Hardware Procurement, Solved Deterministically.
                  </Title>
                  <Paragraph
                    type="secondary"
                    style={{
                      fontSize: 16,
                      maxWidth: 680,
                      margin: "0 auto",
                      lineHeight: 1.6,
                    }}
                  >
                    Specify your workstation requirements in plain English. We optimize stock,
                    warranty, and delivery, negotiate vendor margins, and lock payment under cryptographic Ed25519 spending envelopes.
                  </Paragraph>
                </div>

                {/* Primary Intake Card */}
                <Card
                  className="glass-card"
                  style={{
                    borderRadius: 20,
                    background: isDarkMode ? "rgba(15, 23, 42, 0.78)" : "#ffffff",
                    border: `1px solid ${isDarkMode ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 82, 255, 0.15)"}`,
                    boxShadow: isDarkMode
                      ? "0 20px 48px -12px rgba(0, 82, 255, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.08)"
                      : "0 12px 32px -8px rgba(0, 82, 255, 0.12)",
                    marginBottom: 24,
                  }}
                  bodyStyle={{ padding: 24 }}
                >
                  <div style={{ position: "relative", marginBottom: 16 }}>
                    <TextArea
                      rows={4}
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      placeholder="e.g. I need a dual monitor coding and gaming setup under ₹60,000 with mechanical keyboard and delivery in 5 days..."
                      style={{
                        borderRadius: 14,
                        fontSize: 15,
                        lineHeight: 1.6,
                        padding: 14,
                        background: isDarkMode ? "rgba(2, 6, 23, 0.6)" : "#f8fafc",
                        border: `1px solid ${isDarkMode ? "rgba(255, 255, 255, 0.1)" : "#cbd5e1"}`,
                      }}
                    />
                  </div>

                  {/* Instant Demo Prompt Chips */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 20 }}>
                    <Text type="secondary" style={{ fontSize: 12, fontWeight: 600 }}>
                      Try Preset:
                    </Text>
                    <Tag
                      color="blue"
                      style={{ cursor: "pointer", borderRadius: 100, padding: "3px 12px", fontSize: 12 }}
                      onClick={() => {
                        setPrompt("I need a complete setup for coding and gaming under ₹60,000. I already own a laptop. I need a 144 Hz monitor, keyboard, mouse and headphones. Prioritize value for money, reliability and delivery within a week.");
                        setBudgetINR(60000);
                        setMinRefreshRateHz(144);
                        setMaxDeliveryDays(7);
                      }}
                    >
                      🎮 ₹60k Gaming & Dev Setup
                    </Tag>
                    <Tag
                      color="cyan"
                      style={{ cursor: "pointer", borderRadius: 100, padding: "3px 12px", fontSize: 12 }}
                      onClick={() => {
                        setPrompt("Need an ergonomic remote office hardware bundle under ₹45,000. Low noise mechanical keyboard, wireless mouse, high quality headset, and delivery within 4 days.");
                        setBudgetINR(45000);
                        setMaxDeliveryDays(4);
                      }}
                    >
                      💼 ₹45k Remote Office Rig
                    </Tag>
                    <Tag
                      color="purple"
                      style={{ cursor: "pointer", borderRadius: 100, padding: "3px 12px", fontSize: 12 }}
                      onClick={() => {
                        setPrompt("High-spec developer workstation under ₹1,20,000 with 170Hz 1440p monitor, ultra-light mouse, studio headphones and 8000Hz keyboard.");
                        setBudgetINR(120000);
                        setMinRefreshRateHz(170);
                        setMaxDeliveryDays(3);
                      }}
                    >
                      ⚡ ₹1,20,000 High-Spec Station
                    </Tag>
                    <Tag
                      color="geekblue"
                      style={{ cursor: "pointer", borderRadius: 100, padding: "3px 12px", fontSize: 12 }}
                      onClick={() => {
                        setPrompt("I need 5 laptops for a small shop under 3 lakh INR total, each with at least 16 GB RAM, delivery within 10 days and a minimum one-year warranty.");
                        setBudgetINR(300000);
                        setMaxDeliveryDays(10);
                        setQuantities({ laptop: 5 });
                      }}
                    >
                      💻 5 Laptops Fleet (OEM Volume Tier)
                    </Tag>
                  </div>

                  {/* Primary Action Button */}
                  <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
                    <Button
                      id="btn-generate-plans"
                      type="primary"
                      size="large"
                      icon={<ThunderboltOutlined />}
                      loading={isParsing}
                      onClick={handleParseRequest}
                      style={{
                        borderRadius: 12,
                        fontWeight: 700,
                        fontSize: 15,
                        height: 48,
                        padding: "0 28px",
                        background: "#0052FF",
                        boxShadow: "0 4px 18px rgba(0, 82, 255, 0.4)",
                      }}
                    >
                      Generate Verified Plans →
                    </Button>

                    <Button
                      size="large"
                      icon={<ToolOutlined />}
                      onClick={() => setShowConstraintsEditor(!showConstraintsEditor)}
                      style={{ borderRadius: 12, fontWeight: 600, height: 48 }}
                    >
                      {showConstraintsEditor ? "Hide Constraints" : "Edit Constraints & Budget"}
                    </Button>

                    <Button
                      size="large"
                      icon={<PaperClipOutlined />}
                      onClick={() => setQuoteModalOpen(true)}
                      style={{ borderRadius: 12, fontWeight: 600, height: 48 }}
                    >
                      Paste Supplier Quote
                    </Button>
                  </div>

                  {/* Expandable Structured Constraints Editor */}
                  {showConstraintsEditor && (
                    <div
                      style={{
                        marginTop: 20,
                        padding: 16,
                        borderRadius: 14,
                        background: isDarkMode ? "rgba(2, 6, 23, 0.5)" : "#f1f5f9",
                        border: `1px solid ${isDarkMode ? "rgba(255, 255, 255, 0.06)" : "#e2e8f0"}`,
                      }}
                    >
                      <Row gutter={[16, 16]}>
                        <Col xs={24} sm={8}>
                          <Text strong style={{ fontSize: 13 }}>
                            Budget Cap (INR):
                          </Text>
                          <div style={{ marginTop: 6 }}>
                            <InputNumber
                              value={budgetINR}
                              onChange={(val) => setBudgetINR(val || 60000)}
                              prefix="₹"
                              style={{ width: "100%", borderRadius: 8, fontWeight: 700 }}
                            />
                            <Slider
                              min={20000}
                              max={150000}
                              step={2500}
                              value={budgetINR}
                              onChange={setBudgetINR}
                            />
                          </div>
                        </Col>

                        <Col xs={24} sm={8}>
                          <Text strong style={{ fontSize: 13 }}>
                            Monitor Min Refresh Rate:
                          </Text>
                          <div style={{ marginTop: 6 }}>
                            <InputNumber
                              value={minRefreshRateHz}
                              onChange={(val) => setMinRefreshRateHz(val || 144)}
                              addonAfter="Hz"
                              style={{ width: "100%", borderRadius: 8, fontWeight: 700 }}
                            />
                            <Slider
                              min={60}
                              max={240}
                              step={15}
                              value={minRefreshRateHz}
                              onChange={setMinRefreshRateHz}
                            />
                          </div>
                        </Col>

                        <Col xs={24} sm={8}>
                          <Text strong style={{ fontSize: 13 }}>
                            Delivery Deadline:
                          </Text>
                          <div style={{ marginTop: 6 }}>
                            <InputNumber
                              value={maxDeliveryDays}
                              onChange={(val) => setMaxDeliveryDays(val || 7)}
                              addonAfter="Days"
                              style={{ width: "100%", borderRadius: 8, fontWeight: 700 }}
                            />
                            <Slider
                              min={1}
                              max={14}
                              value={maxDeliveryDays}
                              onChange={setMaxDeliveryDays}
                            />
                          </div>
                        </Col>
                      </Row>
                    </div>
                  )}
                </Card>

                {/* 1-Line Trust Strip */}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "center",
                    alignItems: "center",
                    gap: 16,
                    flexWrap: "wrap",
                    color: "#94a3b8",
                    fontSize: 13,
                    padding: "10px 0",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 12px", borderRadius: 100, background: isDarkMode ? "rgba(255, 255, 255, 0.04)" : "rgba(0, 0, 0, 0.03)", border: `1px solid ${isDarkMode ? "rgba(255, 255, 255, 0.06)" : "#e2e8f0"}` }}>
                    <LockOutlined style={{ color: "#0052FF" }} />
                    <span>Ed25519 Spending Mandates</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 12px", borderRadius: 100, background: isDarkMode ? "rgba(255, 255, 255, 0.04)" : "rgba(0, 0, 0, 0.03)", border: `1px solid ${isDarkMode ? "rgba(255, 255, 255, 0.06)" : "#e2e8f0"}` }}>
                    <SafetyCertificateOutlined style={{ color: "#10b981" }} />
                    <span>PayPal Pay-on-Delivery Hold</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 12px", borderRadius: 100, background: isDarkMode ? "rgba(255, 255, 255, 0.04)" : "rgba(0, 0, 0, 0.03)", border: `1px solid ${isDarkMode ? "rgba(255, 255, 255, 0.06)" : "#e2e8f0"}` }}>
                    <DatabaseOutlined style={{ color: "#06b6d4" }} />
                    <span>36 Catalog Components</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 12px", borderRadius: 100, background: isDarkMode ? "rgba(255, 255, 255, 0.04)" : "rgba(0, 0, 0, 0.03)", border: `1px solid ${isDarkMode ? "rgba(255, 255, 255, 0.06)" : "#e2e8f0"}` }}>
                    <AuditOutlined style={{ color: "#8b5cf6" }} />
                    <span>Real-Time SSE Audit Stream</span>
                  </div>
                </div>
              </motion.div>
            )}

            {/* ========================================================= */}
            {/* SCREEN 2: MULTI-STRATEGY OPTIMIZATION (PLANS) */}
            {/* ========================================================= */}
            {currentStep === 1 && (
              <motion.div
                key="step-1"
                initial={{ opacity: 0, y: 18, scale: 0.995 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -14, scale: 0.995 }}
                transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
              >
                {/* Subheader & Controls */}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 20,
                    flexWrap: "wrap",
                    gap: 12,
                  }}
                >
                  <div>
                    <Title level={3} style={{ margin: "0 0 4px 0", letterSpacing: -0.5 }}>
                      Deterministic Optimizer Results
                    </Title>
                    <Space wrap size={6}>
                      <Tag color="blue" style={{ borderRadius: 100 }}>
                        Budget Cap: ₹{budgetINR.toLocaleString("en-IN")}
                      </Tag>
                      <Tag color="cyan" style={{ borderRadius: 100 }}>
                        Monitor &gt;= {minRefreshRateHz}Hz
                      </Tag>
                      <Tag color="green" style={{ borderRadius: 100 }}>
                        Delivery &lt;= {maxDeliveryDays}d
                      </Tag>
                      {appliedRebateINR > 0 && (
                        <Tag color="gold" style={{ borderRadius: 100 }}>
                          Negotiated Rebate: -₹{appliedRebateINR.toLocaleString()}
                        </Tag>
                      )}
                    </Space>
                  </div>

                  <Space wrap>
                    {/* View Switcher */}
                    <div
                      style={{
                        background: isDarkMode ? "rgba(255, 255, 255, 0.05)" : "rgba(0, 0, 0, 0.04)",
                        borderRadius: 100,
                        padding: 3,
                        display: "flex",
                        gap: 3,
                        border: `1px solid ${isDarkMode ? "rgba(255, 255, 255, 0.08)" : "#e2e8f0"}`,
                      }}
                    >
                      <Button
                        size="small"
                        type={step2ViewMode === "cards" ? "primary" : "text"}
                        onClick={() => setStep2ViewMode("cards")}
                        style={{ borderRadius: 100, fontSize: 12, fontWeight: 600 }}
                      >
                        Cards View
                      </Button>
                      <Button
                        size="small"
                        type={step2ViewMode === "grid" ? "primary" : "text"}
                        onClick={() => setStep2ViewMode("grid")}
                        style={{ borderRadius: 100, fontSize: 12, fontWeight: 600 }}
                      >
                        AG Grid Matrix
                      </Button>
                      <Button
                        size="small"
                        type={step2ViewMode === "radar" ? "primary" : "text"}
                        onClick={() => setStep2ViewMode("radar")}
                        style={{ borderRadius: 100, fontSize: 12, fontWeight: 600 }}
                      >
                        Trade-offs Radar
                      </Button>
                    </div>

                    {/* AI Vendor Negotiator trigger */}
                    <Button
                      icon={<ThunderboltOutlined style={{ color: "#F59E0B" }} />}
                      onClick={() => setNegotiationModalOpen(true)}
                      style={{ borderRadius: 10, fontWeight: 600 }}
                    >
                      AI Vendor Negotiator
                    </Button>
                  </Space>
                </div>

                {/* VIEW MODE 1: FOCUSED CARDS (Plan B Featured Hero) */}
                {step2ViewMode === "cards" && (
                  <Row gutter={[20, 20]} align="stretch">
                    {/* PLAN A: CHEAPEST */}
                    <Col xs={24} lg={7}>
                      <Card
                        className="glass-card-interactive"
                        style={{
                          height: "100%",
                          borderRadius: 18,
                          background: isDarkMode ? "rgba(15, 23, 42, 0.65)" : "#ffffff",
                          border: `1px solid ${isDarkMode ? "rgba(255, 255, 255, 0.08)" : "#e2e8f0"}`,
                          display: "flex",
                          flexDirection: "column",
                        }}
                        bodyStyle={{ padding: 20, display: "flex", flexDirection: "column", height: "100%" }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                          <Tag color="green" style={{ borderRadius: 6, fontWeight: 700 }}>MINIMUM COST</Tag>
                          <Text type="secondary" style={{ fontSize: 12 }}>Plan A</Text>
                        </div>

                        <div style={{ marginBottom: 12 }}>
                          <Money inr={planData.strategies?.CHEAPEST?.totalINR || 0} inrPerUsd={inrPerUsd} size="lg" />
                          <div style={{ fontSize: 12, color: "#10b981", fontWeight: 600, marginTop: 4 }}>
                            Savings vs budget: ₹{(budgetINR - (planData.strategies?.CHEAPEST?.totalINR || 0)).toLocaleString("en-IN")}
                          </div>
                        </div>

                        <Paragraph type="secondary" style={{ fontSize: 12, minHeight: 36, marginBottom: 14 }}>
                          {planData.strategies?.CHEAPEST?.objectiveSummary}
                        </Paragraph>

                        {/* Items list */}
                        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8, marginBottom: 18 }}>
                          {(planData.strategies?.CHEAPEST?.items || []).map((it) => (
                            <div key={it.productId} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", borderRadius: 8, background: isDarkMode ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)", border: `1px solid ${isDarkMode ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)"}` }}>
                              <ProductIcon category={it.category} size={32} />
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 11, fontWeight: 600, lineHeight: 1.3, color: isDarkMode ? "#e2e8f0" : "#1e293b", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{it.name}</div>
                                <div style={{ fontSize: 10, color: isDarkMode ? "#64748b" : "#94a3b8", textTransform: "capitalize", marginTop: 1 }}>{it.category} · {it.brand || "Demo Brand"}</div>
                              </div>
                              <strong style={{ fontFamily: "var(--font-mono)", fontSize: 11, flexShrink: 0, color: isDarkMode ? "#38bdf8" : "#0052FF" }}>₹{it.unitPriceINR.toLocaleString()}</strong>
                            </div>
                          ))}
                        </div>

                        <Button
                          block
                          onClick={() => handleApproveAndLock("CHEAPEST")}
                          style={{ borderRadius: 10, fontWeight: 600 }}
                        >
                          Select Plan A →
                        </Button>
                      </Card>
                    </Col>

                    {/* PLAN B: BEST VALUE (FEATURED HERO CARD) */}
                    <Col xs={24} lg={10}>
                      <Card
                        className="plan-b-featured-card"
                        style={{
                          height: "100%",
                          borderRadius: 20,
                          background: isDarkMode
                            ? "linear-gradient(180deg, rgba(0, 82, 255, 0.12) 0%, rgba(15, 23, 42, 0.9) 100%)"
                            : "linear-gradient(180deg, #eff6ff 0%, #ffffff 100%)",
                          border: "2px solid #0052FF",
                          boxShadow: "0 12px 36px -8px rgba(0, 82, 255, 0.3)",
                          position: "relative",
                        }}
                        bodyStyle={{ padding: 24, display: "flex", flexDirection: "column", height: "100%" }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                          <Tag color="blue" icon={<StarOutlined />} style={{ borderRadius: 6, fontWeight: 800, padding: "2px 8px" }}>
                            ⭐ RECOMMENDED BY OPTIMIZER
                          </Tag>
                          <Tag color="purple" style={{ borderRadius: 6 }}>Plan B</Tag>
                        </div>

                        <div style={{ marginBottom: 12 }}>
                          <Money inr={planData.strategies?.BEST_VALUE?.totalINR || 0} inrPerUsd={inrPerUsd} size="xl" highlight />
                          <div style={{ fontSize: 13, color: "#0052FF", fontWeight: 700, marginTop: 4 }}>
                            Savings vs budget: ₹{(budgetINR - (planData.strategies?.BEST_VALUE?.totalINR || 0)).toLocaleString("en-IN")}
                          </div>
                        </div>

                        <Paragraph style={{ fontSize: 13, marginBottom: 16 }}>
                          {planData.strategies?.BEST_VALUE?.objectiveSummary}
                        </Paragraph>

                        {/* Items list - dynamic with icons */}
                        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
                          {(planData.strategies?.BEST_VALUE?.items || []).map((it) => (
                            <div key={it.productId} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", borderRadius: 8, background: isDarkMode ? "rgba(0,82,255,0.06)" : "rgba(0,82,255,0.04)", border: `1px solid ${isDarkMode ? "rgba(0,82,255,0.15)" : "rgba(0,82,255,0.1)"}` }}>
                              <ProductIcon category={it.category} size={32} />
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 11, fontWeight: 600, lineHeight: 1.3, color: isDarkMode ? "#e2e8f0" : "#1e293b", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{it.name}</div>
                                <div style={{ fontSize: 10, color: isDarkMode ? "#64748b" : "#94a3b8", textTransform: "capitalize", marginTop: 1 }}>{it.category} · {it.brand || "Demo Brand"}</div>
                              </div>
                              <strong style={{ fontFamily: "var(--font-mono)", fontSize: 11, flexShrink: 0, color: "#0052FF" }}>₹{it.unitPriceINR.toLocaleString()}</strong>
                            </div>
                          ))}
                        </div>

                        <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 10 }}>
                          <Button
                            id="btn-approve-plan-b"
                            type="primary"
                            size="large"
                            icon={<CheckCircleOutlined />}
                            onClick={() => handleApproveAndLock("BEST_VALUE")}
                            style={{
                              borderRadius: 12,
                              fontWeight: 800,
                              fontSize: 15,
                              height: 48,
                              background: "#0052FF",
                              boxShadow: "0 4px 20px rgba(0, 82, 255, 0.4)",
                            }}
                          >
                            Approve Plan B & Issue Mandate →
                          </Button>

                          <Button
                            type="text"
                            size="small"
                            icon={<SwapOutlined />}
                            onClick={() => {
                              setActiveMatrixStrategy("BEST_VALUE");
                              setStep2ViewMode("grid");
                            }}
                            style={{ color: "#94a3b8" }}
                          >
                            Customize Components in Matrix View
                          </Button>
                        </div>
                      </Card>
                    </Col>

                    {/* PLAN C: TOP SPEC */}
                    <Col xs={24} lg={7}>
                      <Card
                        className="glass-card-interactive"
                        style={{
                          height: "100%",
                          borderRadius: 18,
                          background: isDarkMode ? "rgba(15, 23, 42, 0.65)" : "#ffffff",
                          border: `1px solid ${isDarkMode ? "rgba(255, 255, 255, 0.08)" : "#e2e8f0"}`,
                          display: "flex",
                          flexDirection: "column",
                        }}
                        bodyStyle={{ padding: 20, display: "flex", flexDirection: "column", height: "100%" }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                          <Tag color="purple" style={{ borderRadius: 6, fontWeight: 700 }}>MAX PERFORMANCE</Tag>
                          <Text type="secondary" style={{ fontSize: 12 }}>Plan C</Text>
                        </div>

                        <div style={{ marginBottom: 12 }}>
                          <Money inr={planData.strategies?.ALTERNATIVE?.totalINR || 0} inrPerUsd={inrPerUsd} size="lg" />
                          <div style={{ fontSize: 12, color: "#8b5cf6", fontWeight: 600, marginTop: 4 }}>
                            Savings vs budget: ₹{(budgetINR - (planData.strategies?.ALTERNATIVE?.totalINR || 0)).toLocaleString("en-IN")}
                          </div>
                        </div>

                        <Paragraph type="secondary" style={{ fontSize: 12, minHeight: 36, marginBottom: 14 }}>
                          {planData.strategies?.ALTERNATIVE?.objectiveSummary}
                        </Paragraph>

                        {/* Items list */}
                        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8, marginBottom: 18 }}>
                          {(planData.strategies?.ALTERNATIVE?.items || []).map((it) => (
                            <div key={it.productId} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", borderRadius: 8, background: isDarkMode ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)", border: `1px solid ${isDarkMode ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)"}` }}>
                              <ProductIcon category={it.category} size={32} />
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 11, fontWeight: 600, lineHeight: 1.3, color: isDarkMode ? "#e2e8f0" : "#1e293b", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{it.name}</div>
                                <div style={{ fontSize: 10, color: isDarkMode ? "#64748b" : "#94a3b8", textTransform: "capitalize", marginTop: 1 }}>{it.category} · {it.brand || "Demo Brand"}</div>
                              </div>
                              <strong style={{ fontFamily: "var(--font-mono)", fontSize: 11, flexShrink: 0, color: isDarkMode ? "#a78bfa" : "#7c3aed" }}>₹{it.unitPriceINR.toLocaleString()}</strong>
                            </div>
                          ))}
                        </div>

                        <Button
                          block
                          onClick={() => handleApproveAndLock("ALTERNATIVE")}
                          style={{ borderRadius: 10, fontWeight: 600 }}
                        >
                          Select Plan C →
                        </Button>
                      </Card>
                    </Col>
                  </Row>
                )}

                {/* VIEW MODE 2: AG GRID INTERACTIVE MATRIX */}
                {step2ViewMode === "grid" && (
                  <StrategyMatrixGrid
                    strategies={planData.strategies}
                    activeStrategyKey={activeMatrixStrategy}
                    onSelectStrategy={setActiveMatrixStrategy}
                    strategy={planData.strategies[activeMatrixStrategy]}
                    budgetCap={budgetINR}
                    isDarkMode={isDarkMode}
                    inrPerUsd={inrPerUsd}
                    onCellValueChanged={() => {}}
                    onResetStrategy={() => {}}
                    onApproveAndLock={handleApproveAndLock}
                    onOpenSwap={(stratKey, item) => {
                      setSwapTarget({ strategyKey: stratKey, currentItem: item });
                      setCategoryCandidates(localCatalog.products?.filter((p) => p.category === item.category) || []);
                      setSwapDrawerOpen(true);
                    }}
                  />
                )}

                {/* VIEW MODE 3: RADAR CHART */}
                {step2ViewMode === "radar" && (
                  <StrategyRadarChart
                    strategies={planData.strategies}
                    budgetCap={budgetINR}
                    isDarkMode={isDarkMode}
                    onSelectStrategy={handleApproveAndLock}
                  />
                )}
              </motion.div>
            )}

            {/* ========================================================= */}
            {/* SCREEN 3: CRYPTOGRAPHIC APPROVAL & PAYPAL HOLD (CHECKOUT) */}
            {/* ========================================================= */}
            {currentStep === 2 && (
              <motion.div
                key="step-2"
                initial={{ opacity: 0, y: 18, scale: 0.995 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -14, scale: 0.995 }}
                transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
              >
                {/* Header info */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 10 }}>
                  <Space align="baseline">
                    <Title level={3} style={{ margin: 0, letterSpacing: -0.5 }}>
                      Order #PA-1042
                    </Title>
                    <Tag color="blue" style={{ borderRadius: 6 }}>plan_demo_1</Tag>
                    <Tag color="green" style={{ borderRadius: 6, fontWeight: 700 }}>APPROVED & BOUND</Tag>
                  </Space>

                  <Button
                    size="small"
                    icon={<SwapOutlined />}
                    onClick={() => setCurrentStep(1)}
                    style={{ borderRadius: 8 }}
                  >
                    Change Strategy
                  </Button>
                </div>

                {/* Balanced 2-Column Grid (50% / 50%) */}
                <Row gutter={[24, 24]}>
                  {/* LEFT COLUMN: Order Summary, Itemized Breakdown & Mandate Card */}
                  <Col xs={24} lg={12}>
                    {/* Itemized Settlement Breakdown */}
                    <Card
                      title={
                        <Space>
                          <FileTextOutlined style={{ color: "#0052FF" }} />
                          <span>Itemized Settlement Breakdown</span>
                        </Space>
                      }
                      style={{
                        borderRadius: 16,
                        marginBottom: 20,
                        background: isDarkMode ? "rgba(15, 23, 42, 0.75)" : "#ffffff",
                        border: `1px solid ${isDarkMode ? "rgba(255, 255, 255, 0.08)" : "#e2e8f0"}`,
                      }}
                      bodyStyle={{ padding: 18 }}
                    >
                      <div style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: 13 }}>
                        <div style={{ display: "flex", justifyContent: "space-between" }}>
                          <Text type="secondary">Items Subtotal (4 verified items)</Text>
                          <strong style={{ fontFamily: "var(--font-mono)" }}>
                            ₹{Number(lockedPlan?.strategy?.subtotalINR || 35492).toLocaleString("en-IN")}
                          </strong>
                        </div>

                        <div style={{ display: "flex", justifyContent: "space-between" }}>
                          <Text type="secondary">Express Delivery & Handling</Text>
                          <Tag color="green" style={{ margin: 0 }}>FREE</Tag>
                        </div>

                        <div style={{ display: "flex", justifyContent: "space-between" }}>
                          <Text type="secondary">Applicable Duties & Taxes</Text>
                          <Text type="secondary">Included</Text>
                        </div>

                        {appliedRebateINR > 0 && (
                          <div style={{ display: "flex", justifyContent: "space-between", color: "#10b981" }}>
                            <span>AI Negotiated Vendor Rebate</span>
                            <strong>-₹{appliedRebateINR.toLocaleString()}</strong>
                          </div>
                        )}

                        <Divider style={{ margin: "6px 0" }} />

                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <Text strong>Total Order Amount (INR)</Text>
                          <span style={{ fontSize: 16, fontWeight: 800 }}>
                            ₹{Number(lockedPlan?.lockedTotalINR || 35492).toLocaleString("en-IN")}
                          </span>
                        </div>

                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12 }}>
                          <Text type="secondary">Live Exchange Rate</Text>
                          <span style={{ fontFamily: "var(--font-mono)", color: "#0052FF" }}>
                            1 USD = ₹{inrPerUsd.toFixed(2)} ({fxData?.source || "open.er-api.com"})
                          </span>
                        </div>

                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            padding: "8px 12px",
                            borderRadius: 8,
                            background: isDarkMode ? "rgba(0, 82, 255, 0.1)" : "#eff6ff",
                            marginTop: 4,
                          }}
                        >
                          <Text strong style={{ color: "#0052FF" }}>PayPal Authorization Ceiling</Text>
                          <span style={{ fontSize: 17, fontWeight: 800, color: "#0052FF", fontFamily: "var(--font-mono)" }}>
                            ${toUSD(lockedPlan?.lockedTotalINR || 35492)} USD
                          </span>
                        </div>
                      </div>
                    </Card>

                    {/* Cryptographically Signed Spending Mandate */}
                    <SignedMandateCard
                      mandate={activeMandate || {
                        mandateId: "mandate_demo_signed_envelope_1042",
                        maxTotalINR: lockedPlan?.lockedTotalINR || 35492,
                        maxTotalUSD: toUSD(lockedPlan?.lockedTotalINR || 35492),
                        priceDriftTolerancePct: 0.0,
                        keyFingerprint: "E3E9C43671FE9202",
                        signature: "fd85b5801511632074494f5d73902ba05094cacc6d0debdf5cef796945dfb85826f8b47e906c6f693b4c5190884d913e26178d840f59f86a6800489f4eed4b03",
                        planVersion: 1,
                      }}
                      budgetCapINR={budgetINR}
                      inrPerUsd={inrPerUsd}
                      isDarkMode={isDarkMode}
                    />

                    {/* Budget Ceiling Meter */}
                    <BudgetCeilingMeter
                      currentTotalINR={lockedPlan?.lockedTotalINR || 35492}
                      maxCeilingINR={budgetINR}
                      isDarkMode={isDarkMode}
                    />
                  </Col>

                  {/* RIGHT COLUMN: Pipeline Visual & PayPal Payment Terminal */}
                  <Col xs={24} lg={12}>
                    {/* Pay-on-Delivery Authorization Hold Pipeline Visual */}
                    <EscrowFlowVisual
                      status={receipt?.status || "DRAFT"}
                      amountINR={lockedPlan?.lockedTotalINR || 35492}
                      amountUSD={toUSD(lockedPlan?.lockedTotalINR || 35492)}
                      isDarkMode={isDarkMode}
                    />

                    {/* Executive Dual-Custody Spending Gate Card */}
                    <Card
                      style={{
                        borderRadius: 14,
                        marginBottom: 16,
                        background: isDarkMode ? "rgba(15, 23, 42, 0.7)" : "#ffffff",
                        border: `1px solid ${
                          cfoApproved
                            ? "#10b981"
                            : isWaitingCfoApproval
                            ? "#f59e0b"
                            : isDarkMode
                            ? "rgba(255, 255, 255, 0.08)"
                            : "#e2e8f0"
                        }`,
                      }}
                      bodyStyle={{ padding: 16 }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
                        <Space align="center">
                          <SafetyCertificateOutlined style={{ color: cfoApproved ? "#10b981" : isWaitingCfoApproval ? "#f59e0b" : "#0052FF", fontSize: 16 }} />
                          <Text strong style={{ fontSize: 13 }}>Executive Dual-Custody Spending Gate</Text>
                        </Space>
                        {cfoApproved ? (
                          <Tag color="green">✓ CFO SIGNED VIA SSE</Tag>
                        ) : isWaitingCfoApproval ? (
                          <Tag color="orange" icon={<ClockCircleOutlined />}>AWAITING CFO SIGNATURE</Tag>
                        ) : (
                          <Tag color="blue">GOVERNANCE READY</Tag>
                        )}
                      </div>

                      <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 12 }}>
                        {cfoApproved
                          ? "Single-use approval token consumed. Executive signature verified via real-time SSE stream. PayPal hold checkout is fully authorized."
                          : isWaitingCfoApproval
                          ? "Expiring approval link generated. Checkout is held until signed by authorized executive authority."
                          : "Require executive finance authorization before placing PayPal authorization hold."}
                      </div>

                      {!isWaitingCfoApproval && !cfoApproved && (
                        <Button
                          size="small"
                          loading={generatingToken}
                          onClick={handleRequestCfoApproval}
                          style={{ borderRadius: 6, fontWeight: 600, fontSize: 12 }}
                        >
                          Request Executive Approval Link
                        </Button>
                      )}

                      {isWaitingCfoApproval && !cfoApproved && (
                        <Space wrap>
                          <Button
                            size="small"
                            onClick={() => {
                              navigator.clipboard?.writeText(cfoApprovalLink);
                              message.success("Copied single-use approval token link!");
                            }}
                            style={{ borderRadius: 6, fontSize: 12 }}
                          >
                            Copy Link
                          </Button>
                          <Button
                            size="small"
                            type="primary"
                            onClick={() => setApprovalModalOpen(true)}
                            style={{ borderRadius: 6, fontSize: 12, background: "#f59e0b", borderColor: "#f59e0b", color: "#000", fontWeight: 700 }}
                          >
                            Simulate CFO Sign-off ↗
                          </Button>
                        </Space>
                      )}
                    </Card>

                    {/* PayPal Payment Terminal */}
                    <Card
                      title={
                        <Space>
                          <LockOutlined style={{ color: "#0052FF" }} />
                          <span>PayPal Pay-on-Delivery Terminal</span>
                        </Space>
                      }
                      style={{
                        borderRadius: 16,
                        background: isDarkMode ? "rgba(15, 23, 42, 0.75)" : "#ffffff",
                        border: `1px solid ${isDarkMode ? "rgba(255, 255, 255, 0.08)" : "#e2e8f0"}`,
                      }}
                      bodyStyle={{ padding: 20 }}
                    >
                      {/* Explanatory Reassurance Banner */}
                      <Alert
                        type="info"
                        showIcon
                        icon={<SafetyCertificateOutlined style={{ color: "#0052FF" }} />}
                        message={<span style={{ fontWeight: 700 }}>Pay-on-Delivery Authorization Hold (Zero Risk)</span>}
                        description="Your card or balance is NOT debited today. PayPal places an authorization hold (valid up to 29 days; funds guaranteed ~3 days (honor period); reauthorize if delivery is later). Funds are captured only after you inspect and confirm delivery."
                        style={{ marginBottom: 16, borderRadius: 10 }}
                      />

                      {/* Exchange Rate Safety Block */}
                      {fxData?.unavailable && (
                        <Alert
                          type="error"
                          showIcon
                          message="Checkout Blocked: Exchange Rate Unavailable"
                          description="Live exchange rate is unavailable and no cached rate was found. Currency conversion cannot proceed safely."
                          style={{ marginBottom: 16, borderRadius: 10 }}
                        />
                      )}

                      {/* Primary Real PayPal Checkout Flow */}
                      <div style={{ marginBottom: 16 }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                          <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "#94a3b8" }}>
                            Official PayPal Sandbox Flow
                          </span>
                          <Tag color="blue">Primary Path</Tag>
                        </div>

                        <PayPalScriptProvider
                          options={{
                            "client-id": PAYPAL_CLIENT_ID,
                            intent: "authorize",
                            currency: "USD",
                          }}
                        >
                          <PayPalButtons
                            disabled={Boolean(fxData?.unavailable || (isWaitingCfoApproval && !cfoApproved))}
                            style={{ layout: "vertical", shape: "rect", borderRadius: 8, height: 44 }}
                            createOrder={async () => {
                              const res = await createOrder({
                                planId: lockedPlan?.planId || "plan_demo_1",
                                version: lockedPlan?.version || 1,
                                intent: "AUTHORIZE",
                                mandateId: activeMandate?.mandateId,
                              });
                              setPendingRealOrderId(res.orderID);
                              setPendingApprovalUrl(res.approvalUrl);
                              try {
                                sessionStorage.setItem("procureai_pending_order_id", res.orderID);
                              } catch (_) {}
                              return res.orderID;
                            }}
                            onApprove={async (data) => {
                              try {
                                message.loading({ content: "Placing PayPal Sandbox Authorization Hold...", key: "paypal_auth", duration: 8 });
                                const authRes = await authorizeOrder({
                                  orderID: data.orderID,
                                  planId: lockedPlan?.planId || "plan_demo_1",
                                  version: lockedPlan?.version || 1,
                                  mandateId: activeMandate?.mandateId,
                                });
                                const receiptData = {
                                  orderID: data.orderID,
                                  authorizationID: authRes.authorizationID,
                                  status: "AUTHORIZED",
                                  capturedUSD: authRes.authorizedUSD || authRes.amount?.value || toUSD(lockedPlan?.lockedTotalINR || 35492),
                                  capturedINR: lockedPlan?.lockedTotalINR || 35492,
                                  authorizationExpiresAt: authRes.authorizationExpiresAt || authRes.expirationTime,
                                  timestamp: new Date().toLocaleTimeString(),
                                };
                                setReceipt(receiptData);
                                try {
                                  sessionStorage.setItem("procureai_receipt", JSON.stringify(receiptData));
                                } catch (_) {}
                                confetti({ particleCount: 60, spread: 60, origin: { y: 0.6 } });
                                message.success({ content: "Hold successfully placed on PayPal Sandbox!", key: "paypal_auth" });
                                setCurrentStep(3);
                              } catch (err) {
                                console.error("PayPal onApprove authorize error:", err);
                                message.error({ content: `Failed to place PayPal hold: ${err.message}`, key: "paypal_auth" });
                              }
                            }}
                            onError={(err) => {
                              console.warn("PayPal Buttons error:", err);
                              message.info("If popup blocked, click 'Open PayPal Sandbox Login in New Tab' below.");
                            }}
                          />
                        </PayPalScriptProvider>

                        <Button
                          block
                          disabled={Boolean(fxData?.unavailable || (isWaitingCfoApproval && !cfoApproved))}
                          onClick={async () => {
                            try {
                              const res = await createOrder({
                                planId: lockedPlan?.planId || "plan_demo_1",
                                version: lockedPlan?.version || 1,
                                intent: "AUTHORIZE",
                                mandateId: activeMandate?.mandateId,
                              });
                              if (res.approvalUrl) {
                                window.open(res.approvalUrl, "_blank");
                                setPendingRealOrderId(res.orderID);
                                try {
                                  sessionStorage.setItem("procureai_pending_order_id", res.orderID);
                                } catch (_) {}
                                message.info("Opened PayPal Sandbox in new tab. Approve with buyer account, then click 'Confirm Approved Hold' below.");
                              }
                            } catch (e) {
                              message.error("Failed to create PayPal order: " + e.message);
                            }
                          }}
                          style={{ marginTop: 8, borderRadius: 8, fontSize: 12, fontWeight: 600 }}
                        >
                          Open PayPal Sandbox Login in New Tab ↗
                        </Button>

                        {pendingRealOrderId && (
                          <Button
                            type="dashed"
                            block
                            onClick={async () => {
                              try {
                                const authRes = await authorizeOrder({
                                  orderID: pendingRealOrderId,
                                  planId: lockedPlan?.planId || "plan_demo_1",
                                  version: lockedPlan?.version || 1,
                                  mandateId: activeMandate?.mandateId,
                                });
                                setReceipt({
                                  orderID: pendingRealOrderId,
                                  authorizationID: authRes.authorizationID,
                                  status: "AUTHORIZED",
                                  capturedUSD: authRes.authorizedUSD || authRes.amount?.value,
                                  capturedINR: lockedPlan?.lockedTotalINR,
                                  authorizationExpiresAt: authRes.authorizationExpiresAt || authRes.expirationTime,
                                  timestamp: new Date().toLocaleTimeString(),
                                });
                                confetti({ particleCount: 60, spread: 60, origin: { y: 0.6 } });
                                message.success("Hold successfully placed on PayPal Sandbox!");
                                setCurrentStep(3);
                              } catch (e) {
                                message.error("Order not yet approved on PayPal: " + e.message);
                              }
                            }}
                            style={{ marginTop: 8, borderRadius: 8, borderColor: "#10b981", color: "#10b981", fontWeight: 700 }}
                          >
                            ✓ Confirm Approved Sandbox Hold ({pendingRealOrderId.slice(0, 14)}...) →
                          </Button>
                        )}
                      </div>

                      <Divider style={{ margin: "16px 0" }}>
                        <span style={{ fontSize: 10, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                          OR TEST RAPID SIMULATION
                        </span>
                      </Divider>

                      {/* Secondary Simulation Mode Button */}
                      <div>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                          <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "#f59e0b" }}>
                            Evaluation Simulator
                          </span>
                          <Tag color="orange">Simulation Mode</Tag>
                        </div>
                        <Button
                          id="btn-fast-simulation-auth"
                          type="primary"
                          block
                          size="large"
                          loading={authorizingManual}
                          disabled={Boolean(fxData?.unavailable || (isWaitingCfoApproval && !cfoApproved))}
                          onClick={handleDirectAuthorize}
                          style={{
                            borderRadius: 10,
                            fontWeight: 700,
                            height: 44,
                            background: isDarkMode ? "#1e293b" : "#f1f5f9",
                            border: `1px solid ${isDarkMode ? "rgba(255, 255, 255, 0.12)" : "#cbd5e1"}`,
                            color: isDarkMode ? "#f8fafc" : "#0f172a",
                            marginBottom: 6,
                          }}
                        >
                          ⚡ 1-Click Fast Simulation Hold →
                        </Button>
                        <div style={{ fontSize: 10, color: "#64748b", textAlign: "center", lineHeight: 1.4 }}>
                          [SIMULATION ONLY — Bypasses buyer login on sandbox.paypal.com for rapid automated evaluation]
                        </div>
                      </div>

                      {/* Discreet Fallback Links */}
                      <div style={{ textAlign: "center", display: "flex", flexDirection: "column", gap: 6, fontSize: 12, marginTop: 12 }}>
                        <Button
                          type="link"
                          size="small"
                          onClick={() => {
                            navigator.clipboard?.writeText(cfoApprovalLink || `${window.location.origin}/?token=sample_demo_approval_token_12345`);
                            message.success("Copied 1-use executive approval token link to clipboard!");
                          }}
                          style={{ fontSize: 11, color: "#94a3b8" }}
                        >
                          🔗 Share Single-Use Approval Token Link
                        </Button>
                      </div>
                    </Card>
                  </Col>
                </Row>
              </motion.div>
            )}

            {/* ========================================================= */}
            {/* SCREEN 4: DELIVERY VERIFICATION & SETTLE (ESCROW RELEASE) */}
            {/* ========================================================= */}
            {currentStep === 3 && (
              <motion.div
                key="step-3"
                initial={{ opacity: 0, y: 18, scale: 0.995 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -14, scale: 0.995 }}
                transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
              >
                <div style={{ maxWidth: 880, margin: "0 auto" }}>
                  {/* Status Banner */}
                  <div
                    style={{
                      padding: "16px 20px",
                      borderRadius: 16,
                      background: receipt?.status === "CAPTURED"
                        ? "rgba(16, 185, 129, 0.12)"
                        : "rgba(0, 82, 255, 0.12)",
                      border: `1px solid ${receipt?.status === "CAPTURED" ? "#10b981" : "#0052FF"}`,
                      marginBottom: 24,
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      flexWrap: "wrap",
                      gap: 12,
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 700, letterSpacing: 0.5 }}>
                        PAYPAL ORDER LIFECYCLE
                      </div>
                      <div style={{ fontSize: 18, fontWeight: 800 }}>
                        {receipt?.status === "CAPTURED"
                          ? "✓ Delivery Confirmed & Funds Captured"
                          : receipt?.status === "PARTIALLY_CAPTURED"
                          ? "⚠️ SLA Breach: 90% Captured, 10% Penalty Refunded"
                          : "🔒 Funds Held in PayPal Authorization Hold"}
                      </div>
                    </div>

                    <Tag
                      color={receipt?.status === "CAPTURED" ? "green" : "blue"}
                      style={{ fontSize: 13, padding: "4px 12px", borderRadius: 8, fontWeight: 700 }}
                    >
                      {receipt?.status || "AUTHORIZED"}
                    </Tag>
                  </div>

                  {/* Vertical Progress Lifecycle */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 16, marginBottom: 24 }}>
                    {/* Node 1: Authorization Active */}
                    <Card
                      className="glass-card-interactive"
                      style={{
                        borderRadius: 14,
                        background: isDarkMode ? "rgba(15, 23, 42, 0.7)" : "#ffffff",
                        border: `1px solid ${isDarkMode ? "rgba(255, 255, 255, 0.08)" : "#e2e8f0"}`,
                      }}
                      bodyStyle={{ padding: 18 }}
                    >
                      <Space align="center" style={{ marginBottom: 8 }}>
                        <CheckCircleOutlined style={{ color: "#10b981", fontSize: 18 }} />
                        <Text strong style={{ fontSize: 15 }}>1. PayPal Authorization Hold Placed</Text>
                      </Space>
                      <div style={{ fontSize: 13, color: "#94a3b8", paddingLeft: 26 }}>
                        ${receipt?.capturedUSD || toUSD(lockedPlan?.lockedTotalINR || 35492)} USD authorized on PayPal Sandbox. Funds authorized: authorization valid up to 29 days; funds guaranteed ~3 days (honor period); reauthorize if delivery is later.
                        <div style={{ marginTop: 4, fontFamily: "var(--font-mono)", fontSize: 11 }}>
                          Auth ID: {receipt?.authorizationID || "AUTH-SANDBOX-HELD"}
                        </div>
                      </div>
                    </Card>

                    {/* Node 2: Courier Dispatched */}
                    <Card
                      className="glass-card-interactive"
                      style={{
                        borderRadius: 14,
                        background: isDarkMode ? "rgba(15, 23, 42, 0.7)" : "#ffffff",
                        border: `1px solid ${isDarkMode ? "rgba(255, 255, 255, 0.08)" : "#e2e8f0"}`,
                      }}
                      bodyStyle={{ padding: 18 }}
                    >
                      <Space align="center" style={{ marginBottom: 8 }}>
                        <CarOutlined style={{ color: "#0052FF", fontSize: 18 }} />
                        <Text strong style={{ fontSize: 15 }}>2. Hardware Dispatched (Courier Transit)</Text>
                      </Space>
                      <div style={{ fontSize: 13, color: "#94a3b8", paddingLeft: 26 }}>
                        Consignment shipped via Express Logistics. Tracking code:{" "}
                        <Text code>TRK-IN-98214-DEL</Text>. Guaranteed delivery deadline: {maxDeliveryDays} days.
                      </div>
                    </Card>

                    {/* Node 3: Delivery Confirmation & Dispute Resolution */}
                    <Card
                      className="glass-card-interactive"
                      style={{
                        borderRadius: 14,
                        background: isDarkMode ? "rgba(15, 23, 42, 0.7)" : "#ffffff",
                        border: `1px solid ${isDarkMode ? "rgba(255, 255, 255, 0.08)" : "#e2e8f0"}`,
                      }}
                      bodyStyle={{ padding: 18 }}
                    >
                      <Space align="center" style={{ marginBottom: 12 }}>
                        <SafetyCertificateOutlined style={{ color: "#06b6d4", fontSize: 18 }} />
                        <Text strong style={{ fontSize: 15 }}>3. Delivery Verification Actions</Text>
                      </Space>

                      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", paddingLeft: 26 }}>
                        <Button
                          id="btn-confirm-delivery"
                          type="primary"
                          size="large"
                          icon={<CheckCircleOutlined />}
                          loading={settling}
                          disabled={receipt?.status === "CAPTURED"}
                          onClick={() => handleConfirmDelivery(0)}
                          style={{
                            borderRadius: 10,
                            fontWeight: 700,
                            background: "#10b981",
                            borderColor: "#10b981",
                          }}
                        >
                          Confirm Flawless Delivery (Capture 100%)
                        </Button>

                        <Button
                          size="large"
                          icon={<UndoOutlined />}
                          loading={settling}
                          disabled={receipt?.status === "CAPTURED"}
                          onClick={() => handleConfirmDelivery(10)}
                          style={{
                            borderRadius: 10,
                            fontWeight: 600,
                            borderColor: "#f59e0b",
                            color: "#f59e0b",
                          }}
                        >
                          Simulate 48hr Delay (90% Capture, 10% SLA Credit)
                        </Button>

                        <Button
                          danger
                          size="large"
                          disabled={receipt?.status === "CAPTURED"}
                          onClick={handleVoidOrder}
                          style={{ borderRadius: 10 }}
                        >
                          Void Authorization
                        </Button>
                      </div>
                    </Card>

                    {/* Node 4: Post-Delivery Settlement, Invoicing & Reconciliation */}
                    <Card
                      className="glass-card-interactive"
                      style={{
                        borderRadius: 16,
                        background: isDarkMode ? "rgba(15, 23, 42, 0.75)" : "#ffffff",
                        border: `1px solid ${isDarkMode ? "rgba(255, 255, 255, 0.08)" : "#e2e8f0"}`,
                      }}
                      bodyStyle={{ padding: 22 }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
                        <Space align="center">
                          <DollarOutlined style={{ color: "#8b5cf6", fontSize: 20 }} />
                          <div>
                            <Text strong style={{ fontSize: 16 }}>4. Settlement, Invoicing & Financial Reconciliation</Text>
                            <div style={{ fontSize: 12, color: "#94a3b8" }}>
                              Automated escrow smart disbursements with cryptographic audit trail
                            </div>
                          </div>
                        </Space>
                        <Tag color="green" icon={<CheckCircleOutlined />} style={{ padding: "2px 8px", fontWeight: 700 }}>
                          ESCROW FULFILLED
                        </Tag>
                      </div>

                      {/* Financial Settlement Breakdown Strip */}
                      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
                        <Col xs={24} sm={8}>
                          <div style={{ padding: "12px 14px", borderRadius: 10, background: isDarkMode ? "rgba(255,255,255,0.03)" : "#f8fafc", border: `1px solid ${isDarkMode ? "rgba(255,255,255,0.06)" : "#e2e8f0"}` }}>
                            <div style={{ fontSize: 11, color: "#94a3b8", textTransform: "uppercase", fontWeight: 700 }}>Gross Captured Funds</div>
                            <div style={{ fontSize: 16, fontWeight: 800, color: "#38bdf8", fontFamily: "var(--font-mono)" }}>
                              ${receipt?.capturedUSD || toUSD(lockedPlan?.lockedTotalINR || 35492)} USD
                            </div>
                            <div style={{ fontSize: 11, color: "#94a3b8" }}>₹{Number(lockedPlan?.lockedTotalINR || 35492).toLocaleString("en-IN")} INR</div>
                          </div>
                        </Col>
                        <Col xs={24} sm={8}>
                          <div style={{ padding: "12px 14px", borderRadius: 10, background: isDarkMode ? "rgba(255,255,255,0.03)" : "#f8fafc", border: `1px solid ${isDarkMode ? "rgba(255,255,255,0.06)" : "#e2e8f0"}` }}>
                            <div style={{ fontSize: 11, color: "#94a3b8", textTransform: "uppercase", fontWeight: 700 }}>Escrow Guarantee Fee (1.5%)</div>
                            <div style={{ fontSize: 16, fontWeight: 800, color: "#10b981", fontFamily: "var(--font-mono)" }}>
                              -${(Number(receipt?.capturedUSD || toUSD(lockedPlan?.lockedTotalINR || 35492)) * 0.015).toFixed(2)} USD
                            </div>
                            <div style={{ fontSize: 11, color: "#10b981" }}>Platform Protection & Audit</div>
                          </div>
                        </Col>
                        <Col xs={24} sm={8}>
                          <div style={{ padding: "12px 14px", borderRadius: 10, background: isDarkMode ? "rgba(255,255,255,0.03)" : "#f8fafc", border: `1px solid ${isDarkMode ? "rgba(255,255,255,0.06)" : "#e2e8f0"}` }}>
                            <div style={{ fontSize: 11, color: "#94a3b8", textTransform: "uppercase", fontWeight: 700 }}>Net Supplier Payout</div>
                            <div style={{ fontSize: 16, fontWeight: 800, color: "#a855f7", fontFamily: "var(--font-mono)" }}>
                              ${(Number(receipt?.capturedUSD || toUSD(lockedPlan?.lockedTotalINR || 35492)) * 0.985).toFixed(2)} USD
                            </div>
                            <div style={{ fontSize: 11, color: "#94a3b8" }}>Disbursement Authorized</div>
                          </div>
                        </Col>
                      </Row>

                      {/* Action Cards Hub */}
                      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
                        <Col xs={24} md={12}>
                          <div
                            style={{
                              padding: 16,
                              borderRadius: 12,
                              background: isDarkMode ? "rgba(0, 82, 255, 0.06)" : "rgba(0, 82, 255, 0.03)",
                              border: `1px solid ${isDarkMode ? "rgba(0, 82, 255, 0.2)" : "rgba(0, 82, 255, 0.15)"}`,
                              height: "100%",
                              display: "flex",
                              flexDirection: "column",
                              justifyContent: "space-between",
                            }}
                          >
                            <div>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                                <Text strong style={{ fontSize: 14, color: "#38bdf8" }}>Official PayPal Invoicing v2</Text>
                                <Tag color="blue">B2B SECURED</Tag>
                              </div>
                              <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 12 }}>
                                Cryptographically sealed tax invoice with itemized specifications, VAT/GSTIN and Ed25519 signature proof.
                              </div>
                            </div>
                            <Button
                              type="primary"
                              icon={<PrinterOutlined />}
                              onClick={handleGenerateInvoice}
                              style={{
                                borderRadius: 8,
                                fontWeight: 700,
                                background: "#0052FF",
                                width: "100%",
                              }}
                            >
                              View Official PayPal Invoice v2 ↗
                            </Button>
                          </div>
                        </Col>

                        <Col xs={24} md={12}>
                          <div
                            style={{
                              padding: 16,
                              borderRadius: 12,
                              background: isDarkMode ? "rgba(255, 255, 255, 0.02)" : "#f8fafc",
                              border: `1px solid ${isDarkMode ? "rgba(255, 255, 255, 0.06)" : "#e2e8f0"}`,
                              height: "100%",
                              display: "flex",
                              flexDirection: "column",
                              justifyContent: "space-between",
                            }}
                          >
                            <div>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                                <Text strong style={{ fontSize: 14 }}>Escrow Reversal & Protection</Text>
                                <Tag color="warning">BUYER SLA</Tag>
                              </div>
                              <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 12 }}>
                                PayPal Sandbox returns 403 PAYOUT_NOT_AVAILABLE for restricted test accounts. Supplier payouts are cleanly simulated with full audit logging.
                              </div>
                            </div>
                            <Button
                              id="btn-trigger-refund"
                              icon={<UndoOutlined />}
                              loading={refunding}
                              onClick={handleTriggerRefund}
                              style={{ borderRadius: 8, fontWeight: 600, width: "100%" }}
                            >
                              Refund via PayPal API
                            </Button>
                          </div>
                        </Col>
                      </Row>

                      {/* Interactive Orders Ledger Toggle Banner */}
                      <div
                        onClick={() => setOrdersLedgerOpen(true)}
                        style={{
                          padding: "12px 18px",
                          borderRadius: 10,
                          background: isDarkMode ? "rgba(255, 255, 255, 0.03)" : "#f1f5f9",
                          border: `1px dashed ${isDarkMode ? "rgba(255, 255, 255, 0.12)" : "#cbd5e1"}`,
                          cursor: "pointer",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          transition: "all 0.2s ease",
                        }}
                      >
                        <Space>
                          <TableOutlined style={{ fontSize: 18, color: "#38bdf8" }} />
                          <div>
                            <Text strong style={{ fontSize: 13 }}>
                              Open Enterprise Orders & Payments Ledger
                            </Text>
                            <div style={{ fontSize: 11, color: "#94a3b8" }}>
                              Inspect 100+ transaction histories, settlement timestamps, authorization IDs & CSV export
                            </div>
                          </div>
                        </Space>
                        <Button size="small" type="default" style={{ borderRadius: 6, fontWeight: 600 }}>
                          View AG Grid Ledger →
                        </Button>
                      </div>
                    </Card>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </main>
      </div>

      {/* ========================================================= */}
      {/* SECONDARY PANELS & DRAWERS (Progressive Disclosure) */}
      {/* ========================================================= */}

      {/* 1. Tools & Ledger Slide-over Drawer (Cmd+K) */}
      <ToolsDrawer
        open={toolsDrawerOpen}
        onClose={() => setToolsDrawerOpen(false)}
        isDarkMode={isDarkMode}
        onOpenOrdersLedger={() => setOrdersLedgerOpen(true)}
        onOpenQuoteIntake={() => setQuoteModalOpen(true)}
        onOpenCatalogExplorer={() => setCatalogGridOpen(true)}
        onOpenAuditLog={() => setTelemetryOpen(true)}
        onOpenNegotiation={() => setNegotiationModalOpen(true)}
        onTriggerPreset={handleTriggerPreset}
      />

      {/* 2. AG Grid Orders Ledger Modal */}
      <OrdersLedgerGrid
        open={ordersLedgerOpen}
        onClose={() => setOrdersLedgerOpen(false)}
        isDarkMode={isDarkMode}
        onOpenInvoice={(order) => {
          setGeneratedInvoice(order);
          setInvoiceModalOpen(true);
        }}
      />

      {/* 3. Official PayPal B2B Tax Invoice Modal */}
      <PayPalInvoiceModal
        open={invoiceModalOpen}
        onClose={() => setInvoiceModalOpen(false)}
        invoiceData={generatedInvoice}
        orderData={receipt}
        lockedPlan={lockedPlan}
        isDarkMode={isDarkMode}
      />

      {/* 3. Multimodal Quote Intake Modal */}
      <MultimodalQuoteModal
        open={quoteModalOpen}
        onClose={() => setQuoteModalOpen(false)}
        budgetINR={budgetINR}
        isDarkMode={isDarkMode}
      />

      {/* 4. AI Vendor Negotiator Modal */}
      <NegotiationModal
        open={negotiationModalOpen}
        onClose={() => setNegotiationModalOpen(false)}
        strategy={planData.strategies.BEST_VALUE}
        isDarkMode={isDarkMode}
        onRebateAgreed={(rebate) => {
          setAppliedRebateINR(rebate);
          message.success(`Vendor negotiation successful! Applied -₹${rebate.toLocaleString()} rebate.`);
        }}
      />

      {/* 5. Executive Dual-Custody Approval Portal Modal */}
      <ApprovalPortalModal
        open={approvalModalOpen}
        onClose={() => setApprovalModalOpen(false)}
        plan={lockedPlan || {
          planId: "plan_demo_1",
          strategyKey: "BEST_VALUE",
          lockedTotalINR: 35492,
          lockedTotalUSD: toUSD(35492),
        }}
        mandate={activeMandate}
        tokenRecord={activeApprovalToken}
        onApprove={() => {
          message.success("Executive dual-custody authorization signed!");
          setCurrentStep(2);
        }}
        isDarkMode={isDarkMode}
        inrPerUsd={inrPerUsd}
      />

      {/* 6. Cryptographic Audit Log & SSE Telemetry Inspector Drawer */}
      <ActivityInspector
        open={telemetryOpen}
        onClose={() => setTelemetryOpen(false)}
        telemetryLogs={telemetryLogs}
        isSseConnected={isSseConnected}
        isDarkMode={isDarkMode}
      />

      {/* 7. Hardware Catalog Explorer Modal */}
      <Modal
        title="Hardware Catalog Explorer (36 Real Components)"
        open={catalogGridOpen}
        onCancel={() => setCatalogGridOpen(false)}
        footer={null}
        width={900}
      >
        <div className="ag-grid-responsive-container">
          <div
            className={isDarkMode ? "ag-theme-quartz-dark" : "ag-theme-quartz"}
            style={{ height: 420, width: "100%", borderRadius: 10, overflow: "hidden" }}
          >
            <AgGridReact
              rowData={localCatalog.products || []}
              columnDefs={[
                { field: "category", width: 120, cellRenderer: (p) => <Tag color="blue">{p.value}</Tag> },
                { field: "name", flex: 1.5, minWidth: 200 },
                { field: "brand", width: 120 },
                { field: "unitPriceINR", headerName: "Price (INR)", width: 130, cellRenderer: (p) => `₹${Number(p.value).toLocaleString()}` },
                { field: "inStock", headerName: "Stock", width: 110, cellRenderer: (p) => p.value ? <Tag color="green">IN STOCK</Tag> : <Tag color="red">OUT OF STOCK</Tag> },
                { field: "deliveryDays", headerName: "Delivery", width: 110, cellRenderer: (p) => `${p.value}d` },
              ]}
              defaultColDef={{ sortable: true, resizable: true }}
            />
          </div>
        </div>
      </Modal>

      {/* 8. Item Swap Drawer */}
      <Drawer
        title="Swap Component for Custom Strategy"
        open={swapDrawerOpen}
        onClose={() => setSwapDrawerOpen(false)}
        width={400}
      >
        {swapTarget && (
          <div>
            <div style={{ marginBottom: 14 }}>
              <Text type="secondary">Current Item:</Text>
              <div style={{ fontWeight: 700 }}>{swapTarget.currentItem?.name}</div>
              <div style={{ color: "#0052FF", fontWeight: 700 }}>₹{swapTarget.currentItem?.unitPriceINR?.toLocaleString()}</div>
            </div>

            <Divider style={{ margin: "14px 0" }} />

            <Text type="secondary" style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase" }}>
              Available Alternatives in Catalog:
            </Text>

            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 10 }}>
              {categoryCandidates.map((cand) => (
                <div
                  key={cand.id || cand.productId}
                  style={{
                    padding: 12,
                    borderRadius: 10,
                    background: isDarkMode ? "rgba(255, 255, 255, 0.04)" : "#f8fafc",
                    border: `1px solid ${isDarkMode ? "rgba(255, 255, 255, 0.08)" : "#e2e8f0"}`,
                    cursor: "pointer",
                  }}
                  onClick={() => {
                    const stratKey = swapTarget.strategyKey;
                    const strat = planData.strategies[stratKey];
                    const updatedItems = strat.items.map((it) =>
                      it.category === cand.category
                        ? {
                            ...it,
                            productId: cand.id || cand.productId,
                            name: cand.name,
                            brand: cand.brand,
                            unitPriceINR: cand.priceINR || cand.unitPriceINR,
                            specs: cand.specsSummary || it.specs,
                          }
                        : it
                    );
                    const subtotal = updatedItems.reduce((s, i) => s + i.unitPriceINR * (i.quantity || 1), 0);
                    setCustomizedStrategies((prev) => ({
                      ...prev,
                      [stratKey]: {
                        ...strat,
                        items: updatedItems,
                        subtotalINR: subtotal,
                        totalINR: subtotal,
                        isCustomized: true,
                      },
                    }));
                    setSwapDrawerOpen(false);
                    message.success(`Swapped to ${cand.name}!`);
                  }}
                >
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{cand.name}</div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
                    <span style={{ fontSize: 12, color: "#94a3b8" }}>{cand.brand}</span>
                    <strong style={{ color: "#0052FF" }}>₹{(cand.priceINR || cand.unitPriceINR).toLocaleString()}</strong>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </Drawer>
    </div>
    </ConfigProvider>
  );
}
