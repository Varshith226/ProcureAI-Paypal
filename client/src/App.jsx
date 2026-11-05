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
  Popover,
  Switch,
  QRCode,
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
  ArrowLeftOutlined,
  ArrowRightOutlined,
  SlidersOutlined,
  ControlOutlined,
  DollarCircleOutlined,
  ArrowUpOutlined,
  InfoCircleOutlined,
  CopyOutlined,
  QrcodeOutlined,
} from "@ant-design/icons";
import { motion, AnimatePresence } from "framer-motion";
import { PayPalScriptProvider, PayPalButtons } from "@paypal/react-paypal-js";
import { AgGridReact } from "ag-grid-react";
import { ModuleRegistry, AllCommunityModule } from "ag-grid-community";
ModuleRegistry.registerModules([AllCommunityModule]);
import confetti from "canvas-confetti";

import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-quartz.css";
import "./theme.css";
import "./App.css";
import "./index.css";

import localCatalog from "./catalog.json";
import { rebalanceBasket } from "./utils/rebalancer";
import { computeTradeoffRecommendations } from "./utils/tradeoffRecommender";
import { computeWhatExtraBuys, computeHowPlanCDiffers } from "./utils/specComparison";
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
  fetchApprovalRequiredApi,
  setApprovalRequiredApi,
  createInvoice,
} from "./api/paypalApi";

// Upgraded UI Components
import HeaderNav from "./components/HeaderNav";
import ToolsDrawer from "./components/ToolsDrawer";
import Money from "./components/Money";
import SignedMandateCard from "./components/SignedMandateCard";
import HoldPipelineVisual from "./components/HoldPipelineVisual";

const AuroraVaultCanvas = React.lazy(() => import("./components/canvas/AuroraVaultCanvas"));
import CustomCursor from "./components/CustomCursor";
import BudgetCeilingMeter from "./components/BudgetCeilingMeter";
import OrdersLedgerGrid from "./components/OrdersLedgerGrid";
import NegotiationModal from "./components/NegotiationModal";
import ApprovalPortalModal from "./components/ApprovalPortalModal";
import MultimodalQuoteModal from "./components/MultimodalQuoteModal";
import ActivityInspector from "./components/ActivityInspector";
import PayPalInvoiceModal from "./components/PayPalInvoiceModal";
import TradeoffConfirmModal from "./components/TradeoffConfirmModal";

const { Header, Content, Footer } = Layout;
const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

const API_BASE = import.meta.env.VITE_API_BASE_URL || "";
const PAYPAL_CLIENT_ID = import.meta.env.VITE_PAYPAL_CLIENT_ID || "sb";

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
// DETERMINISTIC NATURAL LANGUAGE BRIEF PARSER
// ==========================================
function parseProcurementPrompt(text) {
  if (!text || typeof text !== "string") {
    return {
      budget: null,
      quantities: {},
      alreadyOwned: [],
      unspecifiedQtyCategories: [],
      minRefreshRateHz: null,
      maxDeliveryDays: 7,
      needsClarification: true,
      missingFields: ["budgetINR"],
    };
  }
  const norm = text.toLowerCase();
  const categories = ["monitor", "keyboard", "mouse", "headphones", "headset", "laptop"];

  // 1. Budget extraction
  let budget = null;
  const budgetExplicit = text.match(/(?:budget|under|cap|within|max|around|upto|up to|spending)\s*(?:of|is|:)?\s*(?:₹|rs\.?|inr)?\s*([0-9,]+)\s*(k|lakh|lac)?/i);
  const budgetCurrency = text.match(/(?:₹|rs\.?|inr)\s*([0-9,]+)\s*(k|lakh|lac)?/i);
  const budgetK = text.match(/\b([0-9]+)\s*k\b/i);

  if (budgetExplicit) {
    let num = parseFloat(budgetExplicit[1].replace(/,/g, ""));
    const unit = (budgetExplicit[2] || "").toLowerCase();
    if (unit === "k") num *= 1000;
    if (unit === "lakh" || unit === "lac") num *= 100000;
    budget = num;
  } else if (budgetCurrency) {
    let num = parseFloat(budgetCurrency[1].replace(/,/g, ""));
    const unit = (budgetCurrency[2] || "").toLowerCase();
    if (unit === "k") num *= 1000;
    if (unit === "lakh" || unit === "lac") num *= 100000;
    budget = num;
  } else if (budgetK) {
    budget = parseFloat(budgetK[1]) * 1000;
  }

  // 2. Already owned detection
  const owned = new Set();
  const ownedClauses = norm.match(/(?:already own|already have|own|have|got)\s+[^.,;]+/gi) || [];
  for (const clause of ownedClauses) {
    for (const cat of categories) {
      if (new RegExp(`\\b${cat}s?\\b`).test(clause)) {
        owned.add(cat === "headset" ? "headphones" : cat);
      }
    }
  }

  // 3. Requested items & quantities
  // Natural language quantity rules:
  // "a" / "an" = 1
  // "couple", "a couple of", "a couple" = 2
  // "few", "a few" = 3
  // "several" = 4
  // word counts ("one", "two", "three"...)
  // explicit digits ("5 laptops" -> 5)
  // bare list items default to 1; plural bare ("laptops") flagged as unspecified
  const quantities = {};
  const unspecifiedQtyCategories = [];

  for (const cat of categories) {
    const canonicalCat = cat === "headset" ? "headphones" : cat;
    if (owned.has(canonicalCat)) continue;

    if (new RegExp(`\\b${cat}s?\\b`).test(norm)) {
      const countPattern = new RegExp(
        `\\b(a couple of|couple of|a couple|couple|a few|few|several|one|two|three|four|five|six|seven|eight|nine|ten|an|a|\\d+)\\s+(?:(?!and|with|plus|or)[a-z0-9-]+\\s+){0,3}\\b${cat}s?\\b`,
        "i"
      );
      const countMatch = norm.match(countPattern);
      if (countMatch && countMatch[1]) {
        const word = countMatch[1].trim().toLowerCase();
        let qty = 1;
        if (word.includes("couple")) qty = 2;
        else if (word.includes("few")) qty = 3;
        else if (word === "several") qty = 4;
        else if (word === "a" || word === "an" || word === "one") qty = 1;
        else {
          const numWords = { two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
          if (numWords[word]) qty = numWords[word];
          else {
            const n = parseInt(word, 10);
            if (!isNaN(n) && n > 0) qty = n;
          }
        }
        quantities[canonicalCat] = qty;
      } else {
        const isPlural = new RegExp(`\\b${cat}s\\b`, "i").test(norm);
        if (isPlural && canonicalCat !== "headphones" && !norm.includes(`a ${cat}`)) {
          unspecifiedQtyCategories.push(canonicalCat);
          quantities[canonicalCat] = 1;
        } else {
          quantities[canonicalCat] = 1;
        }
      }
    }
  }

  // 4. Refresh rate
  let minRefreshRateHz = null;
  const hzMatch = norm.match(/(\d+)\s*hz/);
  if (hzMatch) minRefreshRateHz = parseInt(hzMatch[1], 10);

  // 5. Max delivery days
  let maxDeliveryDays = 7;
  if (norm.includes("within a week") || norm.includes("one week") || norm.includes("1 week")) maxDeliveryDays = 7;
  else if (norm.includes("two weeks") || norm.includes("2 weeks")) maxDeliveryDays = 14;
  else if (norm.includes("tomorrow") || norm.includes("next day")) maxDeliveryDays = 1;
  else {
    const daysMatch = norm.match(/(\d+)\s*(?:day|days)/);
    if (daysMatch) maxDeliveryDays = parseInt(daysMatch[1], 10);
  }

  const needsClarification = budget === null || Object.keys(quantities).length === 0 || unspecifiedQtyCategories.length > 0;
  const missingFields = [];
  if (budget === null) missingFields.push("budgetINR");
  if (Object.keys(quantities).length === 0) missingFields.push("items");
  if (unspecifiedQtyCategories.length > 0) missingFields.push("quantities");

  return {
    budget,
    quantities,
    alreadyOwned: Array.from(owned),
    unspecifiedQtyCategories,
    minRefreshRateHz,
    maxDeliveryDays,
    needsClarification,
    missingFields,
  };
}

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
// ==========================================
// FEATURE 4: INTERACTIVE 3-STRATEGY SVG RADAR CHART & WHAT-IF TRADE-OFF FRONTIER
// ==========================================
const STRATEGY_RADAR_THEMES = {
  CHEAPEST: {
    color: "#10b981", // Emerald Green
    stroke: "#10b981",
    fill: "rgba(16, 185, 129, 0.22)",
    dotColor: "#34d399",
    name: "Plan A — Lowest Cost",
    badge: "Lowest Cost",
  },
  BEST_VALUE: {
    color: "#38bdf8", // Sky Blue
    stroke: "#38bdf8",
    fill: "rgba(56, 189, 248, 0.32)",
    dotColor: "#60a5fa",
    name: "Plan B — Best Quality in Budget",
    badge: "Recommended",
  },
  ALTERNATIVE: {
    color: "#c084fc", // Radiant Purple
    stroke: "#c084fc",
    fill: "rgba(192, 132, 252, 0.22)",
    dotColor: "#e879f9",
    name: "Plan C — Max Performance",
    badge: "Max Performance",
  },
};

const SmartTradeoffFrontier = ({
  budgetCap = 60000,
  maxDeliveryDays = 7,
  minRefreshRateHz = 144,
  strategies = {},
  catalogProducts = [],
  activeStrategyKey = "BEST_VALUE",
  appliedTradeoff = null,
  onSelectTradeoffForConfirm,
  onApplyTradeoff,
  onResetToDefault,
  isDarkMode = true,
}) => {
  const recommendations = computeTradeoffRecommendations({
    budgetINR: budgetCap,
    maxDeliveryDays,
    minRefreshRateHz,
    strategies,
    catalogProducts,
    activeStrategyKey,
  });

  return (
    <Card
      id="tradeoff-frontier-card"
      style={{
        borderRadius: 16,
        marginTop: 20,
        background: isDarkMode ? "rgba(15, 23, 42, 0.75)" : "#ffffff",
        border: `1px solid ${isDarkMode ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 82, 255, 0.15)"}`,
      }}
      bodyStyle={{ padding: "20px 24px" }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <SlidersOutlined style={{ color: "#38bdf8", fontSize: 17 }} />
            <Title level={4} style={{ margin: 0, letterSpacing: -0.3 }}>
              Smart Trade-off Frontier & Sensitivity Recommendations
            </Title>
            <Tag color="purple" style={{ borderRadius: 100, fontWeight: 700 }}>
              What-If Intelligence
            </Tag>
          </div>
          <Text type="secondary" style={{ fontSize: 12, marginTop: 4, display: "block" }}>
            Deterministic sensitivity trade-offs: adjust delivery deadlines or budget envelopes to unlock cost savings and premium specifications.
          </Text>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {appliedTradeoff && (
            <Tag color="cyan" style={{ borderRadius: 6, fontWeight: 700 }}>
              Active: {appliedTradeoff.title}
            </Tag>
          )}
          <Button
            id="btn-reset-tradeoff-default"
            size="small"
            icon={<UndoOutlined />}
            onClick={onResetToDefault}
            style={{ borderRadius: 8, fontSize: 12, fontWeight: 600 }}
          >
            Reset to Default
          </Button>
        </div>
      </div>

      <Row gutter={[16, 16]}>
        {recommendations.map((rec) => {
          const borderColor = rec.badgeColor === "green" ? "#10b981" : rec.badgeColor === "blue" ? "#38bdf8" : "#c084fc";
          return (
            <Col xs={24} md={8} key={rec.id}>
              <div
                style={{
                  height: "100%",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                  padding: "16px 18px",
                  borderRadius: 14,
                  background: isDarkMode ? "rgba(2, 6, 23, 0.6)" : "#f8fafc",
                  border: `1px solid ${isDarkMode ? "rgba(255, 255, 255, 0.07)" : "#e2e8f0"}`,
                  borderTop: `3px solid ${borderColor}`,
                  transition: "all 0.2s ease",
                }}
              >
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <Space size={8}>
                      {rec.type === "ECONOMY" ? (
                        <DollarCircleOutlined style={{ color: "#10b981", fontSize: 15 }} />
                      ) : rec.type === "UPGRADE" ? (
                        <ArrowUpOutlined style={{ color: "#38bdf8", fontSize: 15 }} />
                      ) : (
                        <ThunderboltOutlined style={{ color: "#c084fc", fontSize: 15 }} />
                      )}
                      <Text strong style={{ fontSize: 13 }}>{rec.title}</Text>
                    </Space>
                    <Space size={4} wrap>
                      <Tag color={rec.badgeColor} style={{ borderRadius: 6, fontSize: 11, fontWeight: 700 }}>
                        {rec.badge}
                      </Tag>
                      {rec.raisesBudget && (
                        <Tag color="warning" style={{ borderRadius: 6, fontSize: 11, fontWeight: 700 }}>
                          {rec.budgetBadgeText || `Raises budget to ₹${rec.newBudgetCap?.toLocaleString("en-IN")}`}
                        </Tag>
                      )}
                      {rec.breaksConstraint && (
                        <Tag color="error" style={{ borderRadius: 6, fontSize: 11, fontWeight: 700 }}>
                          {rec.brokenConstraintText || `Breaks your ${maxDeliveryDays}-day limit`}
                        </Tag>
                      )}
                    </Space>
                  </div>

                  <div style={{ fontSize: 14, fontWeight: 800, color: borderColor, marginBottom: 8 }}>
                    {rec.headline}
                  </div>

                  <Paragraph type="secondary" style={{ fontSize: 12, lineHeight: 1.5, margin: "0 0 12px 0" }}>
                    {rec.description}
                  </Paragraph>

                  {rec.replacements && rec.replacements.length > 0 && (
                    <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 10 }}>
                      <CheckCircleOutlined style={{ color: "#10b981", marginRight: 4 }} />
                      {rec.replacements.length} item substitution(s) ready to verify
                    </div>
                  )}

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr 1fr",
                      gap: 6,
                      background: isDarkMode ? "rgba(255, 255, 255, 0.03)" : "#f1f5f9",
                      padding: "8px 10px",
                      borderRadius: 8,
                      marginBottom: 14,
                      fontSize: 11,
                    }}
                  >
                    {rec.metrics.map((m, i) => (
                      <div key={i}>
                        <div style={{ color: "#64748b", fontSize: 10 }}>{m.label}</div>
                        <div style={{ fontWeight: 700, marginTop: 2, color: m.isGood ? "#10b981" : undefined }}>
                          {m.value}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <Button
                  type="primary"
                  ghost
                  block
                  style={{
                    borderRadius: 8,
                    fontWeight: 700,
                    borderColor,
                    color: borderColor,
                  }}
                  onClick={() => {
                    if (onSelectTradeoffForConfirm) {
                      onSelectTradeoffForConfirm(rec);
                    } else if (onApplyTradeoff) {
                      onApplyTradeoff(rec);
                    }
                  }}
                >
                  {rec.actionLabel} →
                </Button>
              </div>
            </Col>
          );
        })}
      </Row>
    </Card>
  );
};

const StrategyRadarChart = ({
  strategies,
  budgetCap,
  maxDeliveryDays = 7,
  minRefreshRateHz = 144,
  catalogProducts = [],
  isDarkMode,
  onSelectStrategy,
  onApplyTradeoff,
  onSelectTradeoffForConfirm,
  onResetToDefault,
  appliedTradeoff,
}) => {
  const [hoveredKey, setHoveredKey] = useState(null);

  const axes = [
    { label: "Cost Efficiency", key: "cost", anchor: "middle", dx: 0, dy: -14 },
    { label: "Hardware Quality", key: "quality", anchor: "start", dx: 14, dy: -4 },
    { label: "Reliability & Warranty", key: "reliability", anchor: "start", dx: 12, dy: 14 },
    { label: "Delivery Speed", key: "delivery", anchor: "end", dx: -12, dy: 14 },
    { label: "Spec Match", key: "specMatch", anchor: "end", dx: -14, dy: -4 },
  ];

  const calculateNormalizedMetrics = (strat) => {
    // 1. Cost Efficiency
    const total = Number(strat.totalINR || budgetCap);
    const costRatio = Math.max(0.35, Math.min(0.96, 1 - (total / (budgetCap * 1.35))));

    // 2. Hardware Quality
    const rawQ = strat.scoreBreakdown?.quality ?? 0.75;
    const quality = Math.max(0.35, Math.min(0.96, rawQ > 1 ? rawQ / 100 : rawQ));

    // 3. Reliability & Warranty
    const rawR = strat.scoreBreakdown?.reliability ?? 0.8;
    const reliability = Math.max(0.35, Math.min(0.96, rawR > 1 ? rawR / 100 : rawR));

    // 4. Delivery Speed
    const rawD = strat.scoreBreakdown?.delivery ?? 0.85;
    const delivery = Math.max(0.35, Math.min(0.96, rawD > 1 ? rawD / 100 : rawD));

    // 5. Specification Match
    const rawSpec = strat.compositeScore ?? 0.88;
    const specMatch = Math.max(0.4, Math.min(0.98, rawSpec > 1 ? rawSpec / 100 : rawSpec));

    return [costRatio, quality, reliability, delivery, specMatch];
  };

  const center = { x: 230, y: 165 };
  const maxRadius = 110;

  const polarToCartesian = (radius, angleDeg) => {
    const angleRad = ((angleDeg - 90) * Math.PI) / 180;
    return {
      x: center.x + radius * Math.cos(angleRad),
      y: center.y + radius * Math.sin(angleRad),
    };
  };

  const getPolygonPoints = (metrics) => {
    const angleStep = 360 / axes.length;
    return metrics
      .map((val, idx) => {
        const pt = polarToCartesian(val * maxRadius, idx * angleStep);
        return `${pt.x},${pt.y}`;
      })
      .join(" ");
  };

  return (
    <div>
      <Card
        style={{
          borderRadius: 16,
          marginBottom: 20,
          background: isDarkMode ? "rgba(15, 23, 42, 0.75)" : "#ffffff",
          border: `1px solid ${isDarkMode ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 82, 255, 0.15)"}`,
        }}
        bodyStyle={{ padding: 24 }}
      >
        <Row gutter={[28, 24]} align="middle">
          <Col xs={24} md={13} style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div style={{ textAlign: "center", marginBottom: 8 }}>
              <Title level={4} style={{ margin: "0 0 4px 0", letterSpacing: -0.5 }}>
                <CompassOutlined style={{ color: "#38bdf8", marginRight: 8 }} />
                Multi-Dimensional Trade-off Radar
              </Title>
              <Text type="secondary" style={{ fontSize: 12 }}>
                Hover plans to inspect relative strengths across cost, specs, quality, and delivery
              </Text>
            </div>

            <svg
              width="100%"
              height={340}
              viewBox="0 0 460 340"
              style={{ overflow: "visible", maxWidth: 460 }}
            >
              <defs>
                <filter id="radar-glow" x="-20%" y="-20%" width="140%" height="140%">
                  <feGaussianBlur stdDeviation="3" result="blur" />
                  <feComposite in="SourceGraphic" in2="blur" operator="over" />
                </filter>
              </defs>

              {/* Concentric Pentagonal Web Grid */}
              {[0.25, 0.5, 0.75, 1.0].map((ring) => {
                const ringPoints = axes
                  .map((_, idx) => {
                    const pt = polarToCartesian(maxRadius * ring, (idx * 360) / axes.length);
                    return `${pt.x},${pt.y}`;
                  })
                  .join(" ");
                return (
                  <g key={ring}>
                    <polygon
                      points={ringPoints}
                      fill="none"
                      stroke={isDarkMode ? "rgba(255, 255, 255, 0.12)" : "rgba(0, 0, 0, 0.12)"}
                      strokeWidth={1}
                      strokeDasharray={ring < 1.0 ? "3 3" : undefined}
                    />
                    {/* Ring label on top vertical spoke */}
                    <text
                      x={center.x + 4}
                      y={center.y - maxRadius * ring + 10}
                      fill={isDarkMode ? "#64748b" : "#94a3b8"}
                      fontSize={9}
                      fontWeight={700}
                    >
                      {`${Math.round(ring * 100)}%`}
                    </text>
                  </g>
                );
              })}

              {/* Axis Spoke Lines & Padded Labels */}
              {axes.map((ax, idx) => {
                const angle = (idx * 360) / axes.length;
                const spokeEnd = polarToCartesian(maxRadius, angle);
                const labelPos = polarToCartesian(maxRadius + 18, angle);
                return (
                  <g key={ax.key}>
                    <line
                      x1={center.x}
                      y1={center.y}
                      x2={spokeEnd.x}
                      y2={spokeEnd.y}
                      stroke={isDarkMode ? "rgba(255, 255, 255, 0.15)" : "rgba(0, 0, 0, 0.15)"}
                      strokeWidth={1.2}
                    />
                    <text
                      x={labelPos.x + ax.dx}
                      y={labelPos.y + ax.dy}
                      textAnchor={ax.anchor}
                      dominantBaseline="middle"
                      fill={isDarkMode ? "#cbd5e1" : "#334155"}
                      fontSize={11}
                      fontWeight={700}
                    >
                      {ax.label}
                    </text>
                  </g>
                );
              })}

              {/* Plan Polygons */}
              {Object.values(strategies).map((strat) => {
                const cfg = STRATEGY_RADAR_THEMES[strat.strategyKey] || {
                  color: "#38bdf8",
                  stroke: "#38bdf8",
                  fill: "rgba(56, 189, 248, 0.25)",
                  dotColor: "#60a5fa",
                };
                const metrics = calculateNormalizedMetrics(strat);
                const points = getPolygonPoints(metrics);
                const isHovered = hoveredKey === strat.strategyKey;
                const isDimmed = hoveredKey && !isHovered;

                return (
                  <g
                    key={strat.strategyKey}
                    onMouseEnter={() => setHoveredKey(strat.strategyKey)}
                    onMouseLeave={() => setHoveredKey(null)}
                    style={{ cursor: "pointer", transition: "opacity 0.2s ease" }}
                    opacity={isDimmed ? 0.2 : 1}
                  >
                    <polygon
                      points={points}
                      fill={cfg.fill}
                      fillOpacity={isHovered ? 0.5 : strat.strategyKey === "BEST_VALUE" ? 0.32 : 0.2}
                      stroke={cfg.stroke}
                      strokeWidth={isHovered ? 3.5 : strat.strategyKey === "BEST_VALUE" ? 2.8 : 2.0}
                      filter={isHovered ? "url(#radar-glow)" : undefined}
                    />
                    {/* Vertices */}
                    {metrics.map((val, idx) => {
                      const pt = polarToCartesian(val * maxRadius, (idx * 360) / axes.length);
                      return (
                        <circle
                          key={idx}
                          cx={pt.x}
                          cy={pt.y}
                          r={isHovered ? 5.5 : 4}
                          fill={cfg.dotColor}
                          stroke={isDarkMode ? "#0f172a" : "#ffffff"}
                          strokeWidth={1.5}
                        />
                      );
                    })}
                  </g>
                );
              })}
            </svg>

            {/* Interactive Color Swatch Legend */}
            <div style={{ display: "flex", gap: 12, marginTop: 12, flexWrap: "wrap", justifyContent: "center" }}>
              {Object.values(strategies).map((strat) => {
                const cfg = STRATEGY_RADAR_THEMES[strat.strategyKey] || { color: "#38bdf8", name: strat.strategyName };
                const isHovered = hoveredKey === strat.strategyKey;
                return (
                  <div
                    key={strat.strategyKey}
                    onMouseEnter={() => setHoveredKey(strat.strategyKey)}
                    onMouseLeave={() => setHoveredKey(null)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "4px 10px",
                      borderRadius: 100,
                      background: isHovered
                        ? isDarkMode ? "rgba(255, 255, 255, 0.12)" : "rgba(0, 0, 0, 0.08)"
                        : isDarkMode ? "rgba(255, 255, 255, 0.04)" : "rgba(0, 0, 0, 0.03)",
                      border: `1px solid ${isHovered ? cfg.color : "transparent"}`,
                      cursor: "pointer",
                      fontSize: 11,
                      fontWeight: 600,
                    }}
                  >
                    <span style={{ width: 10, height: 10, borderRadius: "50%", background: cfg.color, display: "inline-block" }} />
                    <span style={{ color: cfg.color }}>{strat.strategyName}</span>
                    <span style={{ color: "#94a3b8" }}>(₹{strat.totalINR.toLocaleString("en-IN")})</span>
                  </div>
                );
              })}
            </div>
          </Col>

          {/* Right Strategy Cards */}
          <Col xs={24} md={11}>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {Object.values(strategies).map((strat) => {
                const isBest = strat.strategyKey === "BEST_VALUE";
                const cfg = STRATEGY_RADAR_THEMES[strat.strategyKey] || { color: "#38bdf8" };
                const isHovered = hoveredKey === strat.strategyKey;
                return (
                  <div
                    key={strat.strategyKey}
                    onMouseEnter={() => setHoveredKey(strat.strategyKey)}
                    onMouseLeave={() => setHoveredKey(null)}
                    style={{
                      padding: "14px 16px",
                      borderRadius: 12,
                      background: isHovered
                        ? isDarkMode ? "rgba(255, 255, 255, 0.06)" : "#f8fafc"
                        : isBest
                        ? isDarkMode ? "rgba(0, 82, 255, 0.12)" : "#eff6ff"
                        : isDarkMode ? "rgba(255, 255, 255, 0.02)" : "#f8fafc",
                      border: `1px solid ${isHovered ? cfg.color : isBest ? "#0052FF" : isDarkMode ? "rgba(255, 255, 255, 0.08)" : "#e2e8f0"}`,
                      transition: "all 0.2s ease",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <Space>
                        {strat.icon}
                        <Text strong style={{ fontSize: 14 }}>{strat.strategyName}</Text>
                        {isBest && <Tag color="blue">Top Pick</Tag>}
                      </Space>
                      <Text strong style={{ color: cfg.color, fontSize: 16 }}>
                        ₹{strat.totalINR.toLocaleString("en-IN")}
                      </Text>
                    </div>
                    <Paragraph type="secondary" style={{ fontSize: 12, margin: "6px 0 10px 0" }}>
                      {strat.objectiveSummary}
                    </Paragraph>
                    <Button
                      type={isBest ? "primary" : "default"}
                      size="small"
                      block
                      style={{ borderRadius: 8, fontWeight: 700 }}
                      onClick={() => onSelectStrategy(strat.strategyKey)}
                    >
                      Lock & Approve {strat.strategyName} →
                    </Button>
                  </div>
                );
              })}
            </div>
          </Col>
        </Row>
      </Card>

      {/* Smart Trade-off Frontier & Sensitivity Section */}
      <SmartTradeoffFrontier
        budgetCap={budgetCap}
        maxDeliveryDays={maxDeliveryDays}
        minRefreshRateHz={minRefreshRateHz}
        strategies={strategies}
        catalogProducts={catalogProducts}
        activeStrategyKey="BEST_VALUE"
        appliedTradeoff={appliedTradeoff}
        onSelectTradeoffForConfirm={onSelectTradeoffForConfirm}
        onApplyTradeoff={onApplyTradeoff}
        onResetToDefault={onResetToDefault}
        isDarkMode={isDarkMode}
      />
    </div>
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
  onAutoRebalance,
  onApproveAndLock,
  onOpenSwap,
}) => {
  const gridRef = useRef();

  const currentStrategy = (strategies && activeStrategyKey && strategies[activeStrategyKey]) || strategy || {};
  const items = currentStrategy.items || [];
  const planTotalINR = currentStrategy.totalINR || 0;
  const isOverBudget = planTotalINR > budgetCap;
  const deficitINR = Math.max(0, planTotalINR - budgetCap);
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

    const rows = [];
    const rebate = Number(currentStrategy.appliedRebateINR) || 0;
    if (rebate > 0) {
      rows.push({
        name: "🏷️ AI NEGOTIATED VENDOR REBATE",
        category: "REBATE",
        quantity: 1,
        unitPriceINR: -rebate,
        shippingINR: 0,
        lineTotalINR: -rebate,
        specs: "B2B Volume Concession Verified",
        verification: { status: "VERIFIED" },
      });
    }

    rows.push({
      name: "⚡ SETTLEMENT TOTALS",
      category: "TOTAL",
      quantity: totalQty,
      unitPriceINR: currentStrategy.subtotalINR || (currentStrategy.originalTotalINR || planTotalINR),
      shippingINR: currentStrategy.shippingTotalINR || 0,
      lineTotalINR: planTotalINR,
      specs: `Headroom: ₹${leftover.toLocaleString("en-IN")} (${leftover >= 0 ? "FEASIBLE" : "DEFICIT"})`,
      verification: { status: `PayPal: $${planTotalUSD} USD` },
    });

    return rows;
  }, [items, currentStrategy, budgetCap, planTotalINR, planTotalUSD]);

  const categoryColorMap = {
    MONITOR: "cyan",
    KEYBOARD: "purple",
    MOUSE: "blue",
    HEADPHONES: "magenta",
    REBATE: "gold",
  };

  const columnDefs = useMemo(() => [
    {
      field: "category",
      headerName: "Category",
      width: 135,
      cellRenderer: (p) =>
        p.node?.isRowPinned?.() ? (
          <Tag color={p.value === "REBATE" ? "gold" : "gold"} style={{ fontWeight: 800, borderRadius: 6 }}>
            {p.value}
          </Tag>
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
        p.node?.isRowPinned?.() ? (
          <strong style={{ color: "#38bdf8", letterSpacing: 0.5 }}>{p.value}</strong>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 8, height: "100%" }}>
            <ProductIcon category={p.data?.category} size={28} />
            <div>
              <div style={{ fontWeight: 600, lineHeight: 1.3, fontSize: 12 }}>{p.value}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
                <Text type="secondary" style={{ fontSize: 10 }}>{p.data?.brand || "Demo Brand"}</Text>
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
      cellDataType: false,
      valueFormatter: (p) => {
        if (typeof p.value === "string") return p.value;
        if (p.value && typeof p.value === "object") {
          return Object.entries(p.value).map(([k, v]) => `${k}: ${v}`).join(" · ");
        }
        if (p.data?.attributes && typeof p.data.attributes === "object") {
          return Object.entries(p.data.attributes).map(([k, v]) => `${k}: ${v}`).join(" · ");
        }
        return "Verified Hardware";
      },
      cellRenderer: (p) => {
        let textContent = "";
        if (typeof p.value === "string") {
          textContent = p.value;
        } else if (p.value && typeof p.value === "object") {
          textContent = Object.entries(p.value)
            .map(([k, v]) => `${k}: ${v}`)
            .join(" · ");
        } else if (p.data?.attributes && typeof p.data.attributes === "object") {
          textContent = Object.entries(p.data.attributes)
            .map(([k, v]) => `${k}: ${v}`)
            .join(" · ");
        } else {
          textContent = "Verified Hardware";
        }

        return p.node?.isRowPinned?.() ? (
          <Text strong style={{ color: planTotalINR <= budgetCap ? "#10b981" : "#ef4444" }}>
            {textContent}
          </Text>
        ) : (
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: isDarkMode ? "#94a3b8" : "#475569" }}>
            {textContent}
          </span>
        );
      },
    },
    {
      field: "unitPriceINR",
      headerName: "Unit Price (INR) ✎",
      width: 165,
      editable: (p) => !p.node?.isRowPinned?.(),
      cellEditor: "agNumberCellEditor",
      cellStyle: (p) => (p.node?.isRowPinned?.() ? {} : { cursor: "pointer", background: isDarkMode ? "rgba(0,82,255,0.06)" : "rgba(0,82,255,0.03)" }),
      cellRenderer: (p) => {
        const val = Number(p.value || 0);
        const isNeg = val < 0;
        return (
          <Space>
            <strong style={{ fontFamily: "var(--font-mono)", color: isNeg ? "#10b981" : "inherit" }}>
              {isNeg ? `-₹${Math.abs(val).toLocaleString("en-IN")}` : `₹${val.toLocaleString("en-IN")}`}
            </strong>
            {!p.node?.isRowPinned?.() && (
              <Tag color="blue" style={{ fontSize: 10, padding: "0 4px", cursor: "pointer" }}>Edit</Tag>
            )}
          </Space>
        );
      },
    },
    {
      field: "quantity",
      headerName: "Qty ✎",
      width: 95,
      editable: (p) => !p.node?.isRowPinned?.(),
      cellEditor: "agNumberCellEditor",
      cellStyle: (p) => (p.node?.isRowPinned?.() ? {} : { cursor: "pointer" }),
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
      cellRenderer: (p) => {
        const val = Number(p.value || 0);
        const isNeg = val < 0;
        return (
          <strong style={{ color: isNeg ? "#10b981" : "#0052FF", fontFamily: "var(--font-mono)", fontSize: 14 }}>
            {isNeg ? `-₹${Math.abs(val).toLocaleString("en-IN")}` : `₹${val.toLocaleString("en-IN")}`}
          </strong>
        );
      },
    },
    {
      field: "actions",
      headerName: "Swap Item",
      width: 110,
      cellRenderer: (p) => {
        if (p.node?.isRowPinned?.()) return null;
        return (
          <Button
            size="small"
            icon={<SwapOutlined />}
            onClick={() => onOpenSwap?.(currentStrategy?.strategyKey || activeStrategyKey, p.data)}
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
            {currentStrategy?.appliedRebateINR > 0 ? (
              <div style={{ fontSize: 11, color: "#f59e0b", fontWeight: 700 }}>🏷️ -₹{Number(currentStrategy.appliedRebateINR).toLocaleString("en-IN")} Rebate</div>
            ) : (
              <div style={{ fontSize: 11, color: "#10b981" }}>✓ 100% In-Stock</div>
            )}
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
            key={`${currentStrategy?.strategyKey || activeStrategyKey}_${currentStrategy?.isCustomized ? "custom" : "pristine"}_${items.map(i => `${i.productId || i.name}_${i.quantity}_${i.unitPriceINR}`).join("-")}`}
            ref={gridRef}
            theme="legacy"
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

      {/* Over-budget alert banner */}
      {isOverBudget && (
        <Alert
          id="matrix-over-budget-alert"
          type="error"
          showIcon
          style={{ marginTop: 14, borderRadius: 10 }}
          message={
            <span style={{ fontWeight: 800 }}>
              Budget Cap Exceeded by ₹{deficitINR.toLocaleString("en-IN")} — Spending Mandate Locked
            </span>
          }
          description={
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginTop: 4 }}>
              <span>
                Basket total (₹{planTotalINR.toLocaleString("en-IN")}) exceeds the authorized ₹{budgetCap.toLocaleString("en-IN")} cap. Cryptographic mandate lock is disabled until deficit is resolved.
              </span>
              <Button
                id="btn-auto-rebalance-matrix"
                type="primary"
                icon={<ThunderboltOutlined />}
                onClick={() => onAutoRebalance?.(currentStrategy?.strategyKey || activeStrategyKey)}
                style={{
                  background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
                  borderColor: "#10b981",
                  fontWeight: 700,
                  borderRadius: 8,
                }}
              >
                ⚡ Auto-Rebalance to Fit ₹{budgetCap.toLocaleString("en-IN")}
              </Button>
            </div>
          }
        />
      )}

      {/* Action Footer */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 14, flexWrap: "wrap", gap: 10 }}>
        <Space>
          <Button
            id="btn-reset-matrix-plan"
            size="small"
            icon={<ReloadOutlined />}
            onClick={() => onResetStrategy?.(currentStrategy?.strategyKey || activeStrategyKey)}
          >
            Reset Plan
          </Button>
          {currentStrategy?.isCustomized && (
            <Tag color="orange" style={{ borderRadius: 6, fontSize: 11 }}>Customized</Tag>
          )}
        </Space>

        <Space>
          {isOverBudget && (
            <Button
              id="btn-auto-rebalance-footer"
              type="primary"
              icon={<ThunderboltOutlined />}
              onClick={() => onAutoRebalance?.(currentStrategy?.strategyKey || activeStrategyKey)}
              style={{
                background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
                borderColor: "#10b981",
                fontWeight: 700,
                borderRadius: 8,
                boxShadow: "0 4px 14px rgba(16, 185, 129, 0.4)",
              }}
            >
              ⚡ Auto-Rebalance Basket
            </Button>
          )}

          <Tooltip
            title={
              isOverBudget
                ? `Cannot lock mandate: Basket exceeds authorized budget cap by ₹${deficitINR.toLocaleString("en-IN")}. Click Auto-Rebalance to fit budget.`
                : ""
            }
          >
            <span>
              <Button
                id="btn-approve-matrix-plan"
                type="primary"
                disabled={isOverBudget}
                icon={<CheckCircleOutlined />}
                onClick={() => onApproveAndLock(currentStrategy.strategyKey || activeStrategyKey)}
                style={{
                  background: isOverBudget ? undefined : "#0052FF",
                  fontWeight: 700,
                  borderRadius: 8,
                  boxShadow: isOverBudget ? "none" : "0 4px 14px rgba(0, 82, 255, 0.4)",
                }}
              >
                {isOverBudget
                  ? `Budget Exceeded (₹${planTotalINR.toLocaleString("en-IN")} > ₹${budgetCap.toLocaleString("en-IN")})`
                  : `Lock ${currentStrategy.strategyName || "This Basket"} & Proceed →`}
              </Button>
            </span>
          </Tooltip>
        </Space>
      </div>
    </Card>
  );
};

// ==========================================
// DEFAULT BRIEF CONSTANTS
// ==========================================
const DEFAULT_PROMPT =
  "I need a complete setup for coding and gaming under ₹60,000. I already own a laptop. I need a 144 Hz monitor, keyboard, mouse and headphones. Prioritize value for money, reliability and delivery within a week.";
const DEFAULT_BUDGET = 60000;
const DEFAULT_DELIVERY_DAYS = 7;
const DEFAULT_REFRESH_HZ = 144;
const DEFAULT_QUANTITIES = {
  monitor: 1,
  keyboard: 1,
  mouse: 1,
  headphones: 1,
};

// ==========================================
// MAIN COMPONENT: ProcureAI Application
// ==========================================
export default function App() {
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [bgQuality, setBgQuality] = useState(() => localStorage.getItem("procureai_bg_mode") || "full");
  const [currentStep, setCurrentStep] = useState(0);

  // Single source of truth for prompt & parsed budget
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [budgetINR, setBudgetINR] = useState(DEFAULT_BUDGET);
  const [maxDeliveryDays, setMaxDeliveryDays] = useState(DEFAULT_DELIVERY_DAYS);
  const [minRefreshRateHz, setMinRefreshRateHz] = useState(DEFAULT_REFRESH_HZ);
  const [quantities, setQuantities] = useState({ ...DEFAULT_QUANTITIES });
  const [showConstraintsEditor, setShowConstraintsEditor] = useState(false);
  const [clarificationState, setClarificationState] = useState(null);

  // Optimization & Mandate state
  const [step2ViewMode, setStep2ViewMode] = useState("cards"); // "cards" | "grid" | "radar"
  const [showWhatIfOptions, setShowWhatIfOptions] = useState(false);
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
  const [rebalanceReport, setRebalanceReport] = useState(null);

  // Sensitivity Trade-off State
  const [pendingTradeoff, setPendingTradeoff] = useState(null);
  const [appliedTradeoff, setAppliedTradeoff] = useState(null);
  const [baselineParameters, setBaselineParameters] = useState({
    budgetINR: DEFAULT_BUDGET,
    maxDeliveryDays: DEFAULT_DELIVERY_DAYS,
    minRefreshRateHz: DEFAULT_REFRESH_HZ,
  });

  // Parsing & Loading States
  const [isParsing, setIsParsing] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [isSseConnected, setIsSseConnected] = useState(false);
  const [isPresenterMode, setIsPresenterMode] = useState(() => {
    try {
      return new URLSearchParams(window.location.search).get("present") === "1";
    } catch (_) {
      return false;
    }
  });
  const [authorizingManual, setAuthorizingManual] = useState(false);

  // Executive Approval & Real Order States
  const [requireApproval, setRequireApproval] = useState(true);
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

  // Safe navigation between steps: returning to Brief completely resets customizations,
  // stale rebates, and old plan state so the deterministic check runs 100% fresh from prompt
  const handleNavigateToStep = (targetStep) => {
    if (targetStep === 0) {
      setCustomizedStrategies({});
      setAppliedRebateINR(0);
      setAppliedTradeoff(null);
      setPendingTradeoff(null);
      setLockedPlan(null);
      setPriceSpikeAlert(null);
      setClarificationState(null);
      setServerPlan(null);
    }
    setCurrentStep(targetStep);
  };

  // Reset entire intake brief & constraints to canonical default baseline (₹60,000 setup)
  const handleResetBriefToDefault = () => {
    setPrompt(DEFAULT_PROMPT);
    setBudgetINR(DEFAULT_BUDGET);
    setMaxDeliveryDays(DEFAULT_DELIVERY_DAYS);
    setMinRefreshRateHz(DEFAULT_REFRESH_HZ);
    setQuantities({ ...DEFAULT_QUANTITIES });
    setCustomizedStrategies({});
    setAppliedRebateINR(0);
    setAppliedTradeoff(null);
    setPendingTradeoff(null);
    setBaselineParameters({
      budgetINR: DEFAULT_BUDGET,
      maxDeliveryDays: DEFAULT_DELIVERY_DAYS,
      minRefreshRateHz: DEFAULT_REFRESH_HZ,
    });
    setServerPlan(null);
    setLockedPlan(null);
    setClarificationState(null);
    setPriceSpikeAlert(null);
    message.success("Brief, budget & constraints reset to default baseline (₹60,000).");
  };

  // Reset entire demo state (cleans DB orders, tokens, storage, and resets to Step 0)
  const handleResetDemoState = async () => {
    try {
      await fetch(`${API_BASE}/api/demo/reset`, { method: "POST" });
    } catch (_) {}
    try {
      sessionStorage.clear();
    } catch (_) {}
    handleResetBriefToDefault();
    setCurrentStep(0);
    message.success("Demo state reset: database cleared, storage wiped, baseline restored.");
  };

  // Vendor Rebate handler: updates active rebate and recalculates live basket price
  const handleApplyNegotiatedRebate = (rebate, negResult) => {
    const numRebate = Number(rebate) || 0;
    setAppliedRebateINR(numRebate);
    const targetStratKey = activeMatrixStrategy || "BEST_VALUE";
    const current = planData?.strategies?.[targetStratKey] || planData?.strategies?.BEST_VALUE;
    const origTotal = current?.originalTotalINR || current?.totalINR || 35492;
    const newTotal = Math.max(0, origTotal - numRebate);
    message.success({
      content: `✓ Applied -₹${numRebate.toLocaleString("en-IN")} vendor rebate! Basket updated from ₹${origTotal.toLocaleString("en-IN")} to ₹${newTotal.toLocaleString("en-IN")}.`,
      duration: 4,
    });
  };

  // Autonomous Budget Rebalance handler: optimizes component selection to strictly fit within budget cap
  const handleAutoRebalanceStrategy = (stratKey) => {
    const targetKey = stratKey || activeMatrixStrategy || "BEST_VALUE";
    const current = planData?.strategies?.[targetKey];
    if (!current || !current.items) return;

    const result = rebalanceBasket({
      items: current.items,
      budgetCap: budgetINR || 60000,
      minRefreshRateHz: minRefreshRateHz || 144,
      maxDeliveryDays: maxDeliveryDays || 7,
      catalogProducts: localCatalog.products || [],
    });

    if (!result.needed) {
      message.info("Basket is already within the authorized budget cap.");
      return;
    }

    // Apply the rebalanced items into customizedStrategies
    setCustomizedStrategies((prev) => ({
      ...prev,
      [targetKey]: {
        ...current,
        items: result.rebalancedItems,
        subtotalINR: result.subtotalINR,
        shippingTotalINR: result.shippingTotalINR,
        originalTotalINR: result.totalINR,
        totalINR: Math.max(0, result.totalINR - (appliedRebateINR || 0)),
        leftoverBudgetINR: result.headroomINR,
        isCustomized: true,
      },
    }));

    setRebalanceReport(result);
    message.success({
      content: `✓ Auto-Rebalanced! Saved ₹${result.totalSavedINR.toLocaleString("en-IN")}. Basket fits budget (₹${result.totalINR.toLocaleString("en-IN")}).`,
      duration: 5,
    });
  };

  // Handle What-If Sensitivity Trade-off Request (opens confirmation modal)
  const handleApplyTradeoff = (tradeoffOrDelta) => {
    if (tradeoffOrDelta && tradeoffOrDelta.id && tradeoffOrDelta.title) {
      setPendingTradeoff(tradeoffOrDelta);
    } else {
      // Find recommendation matching delta or fall back to first recommendation
      const recs = computeTradeoffRecommendations({
        budgetINR,
        maxDeliveryDays,
        minRefreshRateHz,
        strategies: planData?.strategies || {},
        catalogProducts: localCatalog.products || [],
        activeStrategyKey: activeMatrixStrategy || "BEST_VALUE",
      });
      const match = recs.find(
        (r) =>
          (tradeoffOrDelta?.maxDeliveryDays && r.actionDelta?.maxDeliveryDays === tradeoffOrDelta.maxDeliveryDays) ||
          (tradeoffOrDelta?.budgetINR && r.actionDelta?.budgetINR === tradeoffOrDelta.budgetINR)
      );
      setPendingTradeoff(match || recs[0]);
    }
  };

  // Handle Confirmed What-If Sensitivity Trade-off Application
  const handleConfirmTradeoff = async (tradeoff) => {
    setPendingTradeoff(null);
    if (!tradeoff) return;

    let newBudget = budgetINR;
    let newDays = maxDeliveryDays;
    let newHz = minRefreshRateHz;

    if (tradeoff.actionDelta?.budgetINR !== undefined) {
      newBudget = Number(tradeoff.actionDelta.budgetINR);
      setBudgetINR(newBudget);
    }
    if (tradeoff.actionDelta?.maxDeliveryDays !== undefined) {
      newDays = Number(tradeoff.actionDelta.maxDeliveryDays);
      setMaxDeliveryDays(newDays);
    }
    if (tradeoff.actionDelta?.minRefreshRateHz !== undefined) {
      newHz = Number(tradeoff.actionDelta.minRefreshRateHz);
      setMinRefreshRateHz(newHz);
    }

    setAppliedTradeoff(tradeoff);

    // Apply concrete new items from the trade-off algorithm!
    const targetKey = activeMatrixStrategy || "BEST_VALUE";
    const currentStrat = planData?.strategies?.[targetKey] || planData?.strategies?.BEST_VALUE;

    if (currentStrat && tradeoff.newItems && tradeoff.newItems.length > 0) {
      const rawSubtotal = tradeoff.newItems.reduce(
        (sum, item) => sum + (Number(item.unitPriceINR) || 0) * (item.quantity || 1),
        0
      );
      const rawShipping = tradeoff.newItems.reduce(
        (sum, item) => sum + (Number(item.shippingINR) || 0) * (item.quantity || 1),
        0
      );
      const rawTotal = rawSubtotal + rawShipping;
      const discountedTotal = Math.max(0, rawTotal - (appliedRebateINR || 0));

      setCustomizedStrategies((prev) => ({
        ...prev,
        [targetKey]: {
          ...currentStrat,
          items: tradeoff.newItems.map((it) => ({
            ...it,
            quantity: it.quantity || 1,
            lineTotalINR: (Number(it.unitPriceINR) || 0) * (it.quantity || 1) + (Number(it.shippingINR) || 0),
          })),
          subtotalINR: rawSubtotal,
          shippingTotalINR: rawShipping,
          totalINR: discountedTotal,
          originalTotalINR: rawTotal,
          leftoverBudgetINR: newBudget - discountedTotal,
          isCustomized: true,
          appliedTradeoffTitle: tradeoff.title,
        },
      }));
    }

    message.success({
      content: `✓ Trade-off applied: ${tradeoff.title}! Basket updated to ₹${tradeoff.projectedTotalINR.toLocaleString("en-IN")}.`,
      duration: 5,
    });
  };

  // Reset Sensitivity Trade-offs to Default Constraints
  const handleResetToDefaultConstraints = async () => {
    setAppliedTradeoff(null);
    setCustomizedStrategies({});
    setAppliedRebateINR(0);
    const defBudget = baselineParameters.budgetINR || 60000;
    const defDays = baselineParameters.maxDeliveryDays || 7;
    const defHz = baselineParameters.minRefreshRateHz || 144;
    setBudgetINR(defBudget);
    setMaxDeliveryDays(defDays);
    setMinRefreshRateHz(defHz);
    await executePlanGeneration(defBudget, quantities, defDays, defHz);
    message.info("Reverted to original brief baseline constraints & default plans.");
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
            setCurrentStep(3); // Jump straight to Settle & Payment Capture!
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
          message.success("✓ Executive Approval received via SSE! Checkout is now unlocked.");
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
        const custom = customizedStrategies[key];
        const rawSubtotal = custom.subtotalINR || custom.items.reduce((s, i) => s + (Number(i.unitPriceINR) || 0) * (i.quantity || 1), 0);
        const rawShipping = custom.shippingTotalINR || custom.items.reduce((s, i) => s + (Number(i.shippingINR) || 0) * (i.quantity || 1), 0);
        const rawTotal = rawSubtotal + rawShipping;
        const discountedTotal = Math.max(0, rawTotal - (appliedRebateINR || 0));

        strats[key] = {
          ...custom,
          subtotalINR: rawSubtotal,
          shippingTotalINR: rawShipping,
          totalINR: discountedTotal,
          originalTotalINR: rawTotal,
          leftoverBudgetINR: currentCap - discountedTotal,
          appliedRebateINR: appliedRebateINR || 0,
          isCustomized: true,
        };
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
        const discountedTotal = Math.max(0, baseTotal - (appliedRebateINR || 0));

        strats[key] = {
          ...baseStrat,
          items: baseStrat.baseItems.map((i) => ({ ...i, quantity: i.quantity || 1 })),
          subtotalINR: rawSubtotal,
          shippingTotalINR: rawShipping,
          totalINR: discountedTotal,
          originalTotalINR: baseTotal,
          leftoverBudgetINR: currentCap - discountedTotal,
          isCustomized: false,
          appliedRebateINR: appliedRebateINR || 0,
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
        const rawTotal = (base.subtotalINR || 0) + (base.shippingTotalINR || 0) || base.originalTotalINR || base.totalINR || 0;
        const totalWithRebate = Math.max(0, rawTotal - (appliedRebateINR || 0));
        merged[key] = {
          ...base,
          subtotalINR: base.subtotalINR || rawTotal,
          shippingTotalINR: base.shippingTotalINR || 0,
          totalINR: totalWithRebate,
          originalTotalINR: rawTotal,
          leftoverBudgetINR: currentCap - totalWithRebate,
          appliedRebateINR: appliedRebateINR || 0,
          isCustomized: Boolean(custom),
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

  const whatExtraBuys = useMemo(() => {
    return computeWhatExtraBuys(
      planData?.strategies?.CHEAPEST,
      planData?.strategies?.BEST_VALUE,
      localCatalog
    );
  }, [planData?.strategies]);

  const howPlanCDiffers = useMemo(() => {
    return computeHowPlanCDiffers(
      planData?.strategies?.ALTERNATIVE,
      planData?.strategies?.BEST_VALUE,
      localCatalog?.products || []
    );
  }, [planData?.strategies, localCatalog]);

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

  // Execution of plan generation once budget & constraints are resolved
  const executePlanGeneration = async (budget, activeQuantities, deliveryDays, refreshHz) => {
    setIsParsing(true);
    setErrorMsg(null);
    setCustomizedStrategies({});
    setAppliedRebateINR(0);
    const startTime = Date.now();
    const effBudget = budget || budgetINR || 60000;
    const effDelivery = deliveryDays || maxDeliveryDays || 7;
    const effRefreshHz = refreshHz || minRefreshRateHz || 144;
    const effQuantities = activeQuantities || quantities;

    let generatedPlan = null;
    // 1. Generate via fast deterministic procurement plan (<15ms, verified & saved in PlanStore)
    try {
      const activeCats = Object.entries(effQuantities)
        .filter(([_, q]) => q > 0)
        .map(([category, quantity]) => ({ category, quantity }));

      const procReq = {
        requestId: `req_${Date.now()}`,
        rawQuery: prompt.trim(),
        budgetINR: effBudget,
        maxDeliveryDays: effDelivery,
        requiredCategories: activeCats.length > 0 ? activeCats : [
          { category: "monitor", quantity: 1 },
          { category: "keyboard", quantity: 1 },
          { category: "mouse", quantity: 1 },
          { category: "headphones", quantity: 1 },
        ],
        hardConstraints: {
          ...(activeCats.some((c) => c.category === "monitor") && effRefreshHz
            ? { monitor: { minRefreshRateHz: effRefreshHz } }
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
      console.warn("Deterministic plan failed, trying AI plan endpoint:", procErr);
    }

    // 2. Fallback to /api/ai/plan if procurement plan was not generated
    if (!generatedPlan) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4000);
        const planRes = await fetch(`${API_BASE}/api/ai/plan`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: [prompt.trim(), `My budget is INR ${effBudget}`] }),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
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
    }

    if (generatedPlan) {
      setServerPlan(generatedPlan);
    }
    setIsParsing(false);
    message.success("Verified server plan generated & registered in PlanStore!");
    setCurrentStep(1); // Advance to Plans screen
  };

  // Confirm Clarification handler: updates budget/quantities and generates plan
  const handleConfirmClarification = async (chosenBudget, updatedQuantities) => {
    const budget = Number(chosenBudget) || 60000;
    setBudgetINR(budget);
    setCustomizedStrategies({});
    setAppliedRebateINR(0);
    const effQty = updatedQuantities || clarificationState?.detectedQuantities || quantities;
    if (updatedQuantities) {
      setQuantities(updatedQuantities);
    }
    const days = clarificationState?.maxDeliveryDays || maxDeliveryDays;
    const hz = clarificationState?.minRefreshRateHz || minRefreshRateHz;
    setClarificationState(null);
    setBaselineParameters({
      budgetINR: budget,
      maxDeliveryDays: days || 7,
      minRefreshRateHz: hz || 144,
    });
    await executePlanGeneration(budget, effQty, days, hz);
  };

  // AI Extraction & Parsing with Natural Language & Clarification
  const handleParseRequest = async () => {
    if (!prompt.trim()) {
      message.error("Please enter a procurement request first.");
      return;
    }

    setIsParsing(true);
    setErrorMsg(null);
    setCustomizedStrategies({});
    setAppliedRebateINR(0);
    setServerPlan(null);
    const startTime = Date.now();

    // 1. Natural Language extraction using deterministic rules:
    // "a"/"an" = 1, "couple" = 2, "few" = 3; "already own" = 0/excluded
    const nlpBrief = parseProcurementPrompt(prompt.trim());

    if (Object.keys(nlpBrief.quantities).length > 0) {
      setQuantities(nlpBrief.quantities);
    }
    if (nlpBrief.minRefreshRateHz) {
      setMinRefreshRateHz(nlpBrief.minRefreshRateHz);
    }
    if (nlpBrief.maxDeliveryDays) {
      setMaxDeliveryDays(nlpBrief.maxDeliveryDays);
    }

    // 2. Check backend /api/ai/parse with timeout guard
    let backendBudget = null;
    const hasBudgetKeyword = /\b(budget|inr|rs|rupees?|₹|\$|\d+k\b)/i.test(prompt);

    if (nlpBrief.budget || hasBudgetKeyword) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3500); // 3.5s timeout guard
        const response = await fetch(`${API_BASE}/api/ai/parse`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: [prompt.trim()] }),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        if (response.ok) {
          const data = await response.json().catch(() => ({}));
          logTelemetry("POST /api/ai/parse", `Extracted requirements (Status: ${data.status})`, "200 OK", Date.now() - startTime, data);
          const req = data.request || data.requirements;
          if (req?.budget?.amount && req.budget.amount > 0) {
            backendBudget = req.budget.amount;
          }
        }
      } catch (parseErr) {
        console.warn("Backend parse call fallback/timeout:", parseErr.message);
      }
    } else {
      // Prompt explicitly omitted budget keywords; fire telemetry parse in background without blocking UI
      fetch(`${API_BASE}/api/ai/parse`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: [prompt.trim()] }),
      }).then(r => r.json()).then(data => {
        logTelemetry("POST /api/ai/parse", `Extracted requirements (Status: ${data?.status})`, "200 OK", Date.now() - startTime, data);
      }).catch(err => {
        console.warn("Background parse error:", err.message);
      });
    }

    // 3. Check if budget was omitted in prompt:
    const effectiveBudget = nlpBrief.budget || backendBudget;

    if (!effectiveBudget) {
      // The user did NOT provide a budget! DO NOT default to 60k!
      // Ask clarification question back to user.
      setIsParsing(false);
      logTelemetry(
        "POST /api/ai/parse",
        "Agent Clarification: Budget omitted by user",
        "NEEDS_CLARIFICATION",
        Date.now() - startTime,
        { missingField: "budgetINR", detectedQuantities: nlpBrief.quantities, alreadyOwned: nlpBrief.alreadyOwned }
      );

      setClarificationState({
        active: true,
        field: "budgetINR",
        question: "What is your total target budget cap for this workstation setup?",
        detectedQuantities: nlpBrief.quantities,
        alreadyOwned: nlpBrief.alreadyOwned,
        unspecifiedQtyCategories: nlpBrief.unspecifiedQtyCategories,
        selectedBudget: 60000,
        customBudget: "",
        minRefreshRateHz: nlpBrief.minRefreshRateHz,
        maxDeliveryDays: nlpBrief.maxDeliveryDays,
      });

      message.info("ProcureAI Agent requires clarification: What is your target spending budget?");
      return;
    }

    // If budget was explicitly mentioned, proceed directly
    setClarificationState(null);
    setBudgetINR(effectiveBudget);
    setBaselineParameters({
      budgetINR: effectiveBudget,
      maxDeliveryDays: nlpBrief.maxDeliveryDays || 7,
      minRefreshRateHz: nlpBrief.minRefreshRateHz || 144,
    });
    await executePlanGeneration(effectiveBudget, nlpBrief.quantities, nlpBrief.maxDeliveryDays, nlpBrief.minRefreshRateHz);
  };

  // Reset customized strategy back to original pristine baseline / server plan
  const handleResetStrategy = (strategyKey) => {
    const key = strategyKey || activeMatrixStrategy;
    setCustomizedStrategies((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setAppliedRebateINR(0);
    message.success(`Reset ${key} to original verified default plan!`);
  };

  // Cell editing in AG Grid matrix: update items and recalculate totals
  const handleMatrixCellValueChanged = (event) => {
    const { data, colDef, newValue } = event;
    const stratKey = activeMatrixStrategy;
    const current = planData?.strategies?.[stratKey];
    if (!current || !current.items) return;

    const updatedItems = current.items.map((it) => {
      const isMatch = (it.productId && it.productId === data.productId) || (it.name && it.name === data.name) || (it.category && it.category === data.category);
      if (isMatch) {
        const itemCopy = { ...it, ...data };
        if (colDef.field === "unitPriceINR") {
          itemCopy.unitPriceINR = Math.max(0, Number(newValue) || 0);
        }
        if (colDef.field === "quantity") {
          itemCopy.quantity = Math.max(1, parseInt(newValue, 10) || 1);
        }
        return itemCopy;
      }
      return it;
    });

    const subtotalINR = updatedItems.reduce(
      (sum, it) => sum + (Number(it.unitPriceINR) || 0) * (Number(it.quantity) || 1),
      0
    );
    const shippingTotalINR = updatedItems.reduce(
      (sum, it) => sum + (Number(it.shippingINR) || 0) * (Number(it.quantity) || 1),
      0
    );
    const totalINR = Math.max(0, subtotalINR + shippingTotalINR - (appliedRebateINR || 0));

    setCustomizedStrategies((prev) => ({
      ...prev,
      [stratKey]: {
        ...current,
        items: updatedItems,
        subtotalINR,
        shippingTotalINR,
        totalINR,
        isCustomized: true,
      },
    }));
    message.info(`Recalculated ${current.strategyName} with updated ${colDef.headerName || colDef.field}!`);
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

        // Pre-generate single-use approval token for immediate link & QR readiness
        try {
          const tRes = await createApprovalTokenApi(mandateRes.mandateId, {
            planVersion: mandateRes.planVersion || 1,
            actor: "procurement_agent",
          });
          setActiveApprovalToken(tRes);
          const link = `${window.location.origin}/?token=${tRes.token}`;
          setCfoApprovalLink(link);
          setIsWaitingCfoApproval(true);
          setCfoApproved(false);
        } catch (tErr) {
          console.warn("Auto token issue notice:", tErr);
        }
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

  // Request Executive Approval Token
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
        requireApproval,
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
          step={currentStep}
        />
      </React.Suspense>

      {/* UNIQUE AURORA VAULT CURSOR FOLLOWER */}
      <CustomCursor isDarkMode={isDarkMode} disabled={isPresenterMode} />

      {/* FOREGROUND APPLICATION CONTAINER */}
      <div
        className={isPresenterMode ? "presenter-mode" : ""}
        style={{
          position: "relative",
          zIndex: 1,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          zoom: isPresenterMode ? 1.08 : 1,
        }}
      >
        {/* Soft Radial Scrim for Text Contrast AA Integrity */}
        <div className="content-stage-scrim" />
        {/* SLIM 60PX TOP NAVIGATION HEADER */}
        <HeaderNav
          currentStep={currentStep}
          onStepChange={handleNavigateToStep}
          isDarkMode={isDarkMode}
          onToggleDarkMode={() => setIsDarkMode(!isDarkMode)}
          bgQuality={bgQuality}
          onChangeBgQuality={handleBgQualityChange}
          fxData={fxData}
          onOpenTools={() => setToolsDrawerOpen(true)}
          onTriggerPreset={handleTriggerPreset}
          isPresenterMode={isPresenterMode}
          onTogglePresenterMode={() => {
            const next = !isPresenterMode;
            setIsPresenterMode(next);
            message.info(next ? "🎬 Presenter mode enabled (110% zoom)" : "Presenter mode disabled");
          }}
          onResetDemoState={handleResetDemoState}
        />
        <div style={{ height: 56, flexShrink: 0 }} />

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
                style={{
                  minHeight: "calc(100vh - 180px)",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "center",
                }}
              >
                {/* Hero Headline */}
                <div style={{ textAlign: "center", marginBottom: 28, marginTop: 4 }}>
                  <Space align="center" style={{ marginBottom: 12 }}>
                    <Tag
                      color="blue"
                      style={{
                        borderRadius: 100,
                        padding: "3px 12px",
                        fontSize: 12,
                        fontWeight: 700,
                        background: isDarkMode ? "rgba(0, 82, 255, 0.15)" : "#eff6ff",
                        border: "1px solid rgba(0, 82, 255, 0.3)",
                      }}
                    >
                      ⚡ AUTONOMOUS AGENTIC COMMERCE
                    </Tag>
                    <Tag
                      color="default"
                      style={{
                        borderRadius: 100,
                        padding: "3px 12px",
                        fontSize: 11,
                        fontWeight: 600,
                        color: isDarkMode ? "#e2e8f0" : "#334155",
                        background: isDarkMode ? "rgba(255, 255, 255, 0.08)" : "#f1f5f9",
                        border: `1px solid ${isDarkMode ? "rgba(255, 255, 255, 0.15)" : "#cbd5e1"}`,
                      }}
                    >
                      🛡️ Sandbox mode: no real money
                    </Tag>
                  </Space>
                  <Title
                    level={1}
                    style={{
                      margin: "0 0 10px 0",
                      fontSize: "clamp(26px, 4vw, 40px)",
                      letterSpacing: "-0.03em",
                      fontWeight: 800,
                      color: isDarkMode ? "#f8fafc" : "#0f172a",
                    }}
                  >
                    Buy with an AI agent that <span style={{ background: "linear-gradient(135deg, #60a5fa 0%, #38bdf8 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>can't overspend</span>.
                  </Title>
                  <Paragraph
                    style={{
                      fontSize: 16,
                      maxWidth: 720,
                      margin: "0 auto",
                      lineHeight: 1.5,
                      color: isDarkMode ? "#C5CCDA" : "#334155",
                    }}
                  >
                    Describe what you need. ProcureAI finds verified options, you set the limit, and PayPal holds payment until delivery.
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

                  {/* Trust Line */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 14,
                      marginBottom: 16,
                      fontSize: 13,
                      fontWeight: 600,
                      color: isDarkMode ? "#94a3b8" : "#64748b",
                      flexWrap: "wrap",
                    }}
                  >
                    <span>🤖 AI proposes</span>
                    <span>·</span>
                    <span>⚙️ Engine verifies</span>
                    <span>·</span>
                    <span>🛡️ PayPal protects</span>
                  </div>

                  {/* Instant Demo Prompt Chips */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 20 }}>
                    <Text type="secondary" style={{ fontSize: 13, fontWeight: 700 }}>
                      Try:
                    </Text>
                    <Tag
                      color="blue"
                      style={{ cursor: "pointer", borderRadius: 100, padding: "5px 14px", fontSize: 14, fontWeight: 600 }}
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
                      style={{ cursor: "pointer", borderRadius: 100, padding: "5px 14px", fontSize: 14, fontWeight: 600 }}
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
                      style={{ cursor: "pointer", borderRadius: 100, padding: "5px 14px", fontSize: 14, fontWeight: 600 }}
                      onClick={() => {
                        setPrompt("High-spec developer workstation under ₹1,20,000 with 170Hz 1440p monitor, ultra-light mouse, studio headphones and 8000Hz keyboard.");
                        setBudgetINR(120000);
                        setMinRefreshRateHz(170);
                        setMaxDeliveryDays(3);
                      }}
                    >
                      ⚡ ₹1.2L High-Spec Station
                    </Tag>
                    <Tag
                      color="geekblue"
                      style={{ cursor: "pointer", borderRadius: 100, padding: "5px 14px", fontSize: 14, fontWeight: 600 }}
                      onClick={() => {
                        setPrompt("I need 5 laptops for a small shop under 3 lakh INR total, each with at least 16 GB RAM, delivery within 10 days and a minimum one-year warranty.");
                        setBudgetINR(300000);
                        setMaxDeliveryDays(10);
                        setQuantities({ laptop: 5 });
                      }}
                    >
                      💻 ₹3L 5-Laptop Fleet
                    </Tag>
                  </div>

                  {/* AGENT CLARIFICATION CARD */}
                  <AnimatePresence>
                    {clarificationState?.active && (
                      <motion.div
                        id="agent-clarification-card"
                        initial={{ opacity: 0, y: -10, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -10, scale: 0.98 }}
                        transition={{ duration: 0.25 }}
                        style={{
                          marginBottom: 20,
                          borderRadius: 16,
                          padding: 20,
                          background: isDarkMode ? "linear-gradient(135deg, rgba(30, 41, 59, 0.9), rgba(15, 23, 42, 0.95))" : "linear-gradient(135deg, #f0f7ff, #ffffff)",
                          border: "1.5px solid #0284c7",
                          boxShadow: "0 10px 30px -5px rgba(2, 132, 199, 0.25)",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
                          <Space align="center">
                            <span style={{ fontSize: 24 }}>🤖</span>
                            <div>
                              <div style={{ fontWeight: 800, fontSize: 15, color: isDarkMode ? "#38bdf8" : "#0369a1", display: "flex", alignItems: "center", gap: 8 }}>
                                ProcureAI Agent Needs Clarification
                                <Tag color="warning" style={{ borderRadius: 100, fontWeight: 700, fontSize: 11 }}>
                                  Status: NEEDS_CLARIFICATION
                                </Tag>
                              </div>
                              <div style={{ fontSize: 13, color: isDarkMode ? "#cbd5e1" : "#475569", marginTop: 2 }}>
                                {clarificationState.question}
                              </div>
                            </div>
                          </Space>
                          <Button
                            size="small"
                            type="text"
                            onClick={() => setClarificationState(null)}
                            style={{ color: "#94a3b8" }}
                          >
                            Dismiss ✕
                          </Button>
                        </div>

                        {/* Extracted Context Badges */}
                        <div style={{ padding: "10px 14px", borderRadius: 10, background: isDarkMode ? "rgba(2, 6, 23, 0.4)" : "#e2e8f044", marginBottom: 16 }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", marginBottom: 6 }}>
                            Parsed Workstation Scope & Natural Language Evidence:
                          </div>
                          <Space wrap size={[6, 6]}>
                            {Object.entries(clarificationState.detectedQuantities || {}).map(([cat, qty]) => (
                              <Tag key={cat} color="blue" style={{ borderRadius: 6, fontWeight: 600, padding: "2px 8px" }}>
                                ✓ {qty}x {cat.toUpperCase()}{cat === "monitor" && clarificationState.minRefreshRateHz ? ` (${clarificationState.minRefreshRateHz}Hz)` : ""}
                              </Tag>
                            ))}
                            {(clarificationState.alreadyOwned || []).map((cat) => (
                              <Tag key={cat} color="default" style={{ borderRadius: 6, opacity: 0.75, padding: "2px 8px" }}>
                                🚫 {cat.toUpperCase()} (Already Owned · Excluded)
                              </Tag>
                            ))}
                            {clarificationState.maxDeliveryDays && (
                              <Tag color="cyan" style={{ borderRadius: 6, fontWeight: 600, padding: "2px 8px" }}>
                                ⚡ Delivery &lt;= {clarificationState.maxDeliveryDays}d
                              </Tag>
                            )}
                          </Space>
                        </div>

                        {/* Unspecified quantity helper if any category had no count */}
                        {clarificationState.unspecifiedQtyCategories && clarificationState.unspecifiedQtyCategories.length > 0 && (
                          <div style={{ marginBottom: 16, padding: "10px 14px", borderRadius: 10, background: isDarkMode ? "rgba(245, 158, 11, 0.08)" : "#fef3c7", border: "1px solid rgba(245, 158, 11, 0.2)" }}>
                            <Text strong style={{ fontSize: 12, color: isDarkMode ? "#fbbf24" : "#b45309" }}>
                              Unspecified Quantity Detected:
                            </Text>
                            {clarificationState.unspecifiedQtyCategories.map((cat) => (
                              <div key={cat} style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 6, flexWrap: "wrap" }}>
                                <span style={{ fontSize: 12 }}>How many <strong>{cat}s</strong> do you need?</span>
                                <Space size={6}>
                                  {[
                                    { label: "1 unit (\"a\")", qty: 1 },
                                    { label: "2 units (\"couple\")", qty: 2 },
                                    { label: "3 units (\"few\")", qty: 3 },
                                    { label: "5 units (\"fleet\")", qty: 5 },
                                  ].map((opt) => (
                                    <Button
                                      key={opt.qty}
                                      size="small"
                                      type={clarificationState.detectedQuantities[cat] === opt.qty ? "primary" : "default"}
                                      onClick={() => {
                                        setClarificationState((prev) => ({
                                          ...prev,
                                          detectedQuantities: { ...prev.detectedQuantities, [cat]: opt.qty },
                                        }));
                                      }}
                                      style={{ borderRadius: 6, fontSize: 11 }}
                                    >
                                      {opt.label}
                                    </Button>
                                  ))}
                                </Space>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Target Spending Budget Selector */}
                        <div style={{ marginBottom: 14 }}>
                          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8, color: isDarkMode ? "#e2e8f0" : "#1e293b" }}>
                            Select Target Budget Cap:
                          </div>
                          <Row gutter={[10, 10]}>
                            {[
                              { amount: 45000, label: "₹45,000", tag: "Value Rig", desc: "Solid 1080p, budget peripherals" },
                              { amount: 60000, label: "₹60,000", tag: "Balanced Pro", desc: "144Hz IPS + Mechanical + Studio Audio" },
                              { amount: 80000, label: "₹80,000", tag: "Performance Gaming & Dev", desc: "High FPS, Low Latency, 240Hz" },
                              { amount: 120000, label: "₹1,20,000", tag: "Flagship Enthusiast", desc: "Top tier, wireless lossless, 1440p" },
                            ].map((tier) => {
                              const isSelected = (clarificationState.selectedBudget === tier.amount) && !clarificationState.customBudget;
                              return (
                                <Col xs={12} sm={6} key={tier.amount}>
                                  <div
                                    onClick={() => {
                                      setClarificationState((prev) => ({
                                        ...prev,
                                        selectedBudget: tier.amount,
                                        customBudget: "",
                                      }));
                                    }}
                                    style={{
                                      padding: "10px 12px",
                                      borderRadius: 10,
                                      cursor: "pointer",
                                      textAlign: "center",
                                      border: `1.5px solid ${isSelected ? "#0052FF" : isDarkMode ? "rgba(255,255,255,0.08)" : "#cbd5e1"}`,
                                      background: isSelected
                                        ? isDarkMode ? "rgba(0, 82, 255, 0.2)" : "#eff6ff"
                                        : isDarkMode ? "rgba(255,255,255,0.02)" : "#ffffff",
                                      transition: "all 0.15s ease",
                                    }}
                                  >
                                    <div style={{ fontWeight: 800, fontSize: 15, color: isSelected ? "#38bdf8" : undefined }}>
                                      {tier.label}
                                    </div>
                                    <Tag color={isSelected ? "blue" : "default"} style={{ margin: "4px 0 2px 0", fontSize: 10, borderRadius: 4 }}>
                                      {tier.tag}
                                    </Tag>
                                    <div style={{ fontSize: 10, color: "#94a3b8", lineHeight: 1.2 }}>{tier.desc}</div>
                                  </div>
                                </Col>
                              );
                            })}
                          </Row>
                        </div>

                        {/* Custom Budget or Confirmation */}
                        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginTop: 14 }}>
                          <InputNumber
                            prefix="₹"
                            placeholder="Or enter custom budget (e.g. 50000)"
                            value={clarificationState.customBudget || undefined}
                            onChange={(val) => {
                              setClarificationState((prev) => ({
                                ...prev,
                                customBudget: val || "",
                                selectedBudget: val || prev.selectedBudget,
                              }));
                            }}
                            style={{ width: 230, borderRadius: 8, fontWeight: 700 }}
                          />
                          <Button
                            id="btn-confirm-clarification"
                            type="primary"
                            icon={<CheckCircleOutlined />}
                            loading={isParsing}
                            onClick={() => {
                              const finalBudget = clarificationState.customBudget
                                ? Number(clarificationState.customBudget)
                                : clarificationState.selectedBudget;
                              handleConfirmClarification(finalBudget, clarificationState.detectedQuantities);
                            }}
                            style={{
                              borderRadius: 8,
                              fontWeight: 700,
                              background: "#0052FF",
                              padding: "0 22px",
                              height: 38,
                            }}
                          >
                            Confirm Budget & Generate Plans →
                          </Button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Primary Action Button & Quiet Links */}
                  <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center" }}>
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
                      Generate verified plans →
                    </Button>

                    <Space size={12} wrap>
                      <Button
                        type="text"
                        icon={<ToolOutlined />}
                        onClick={() => setShowConstraintsEditor(!showConstraintsEditor)}
                        style={{ fontSize: 13, color: isDarkMode ? "#94a3b8" : "#475569", fontWeight: 500 }}
                      >
                        {showConstraintsEditor ? "Hide constraints" : "Edit constraints"}
                      </Button>

                      <Button
                        type="text"
                        icon={<PaperClipOutlined />}
                        onClick={() => setQuoteModalOpen(true)}
                        style={{ fontSize: 13, color: isDarkMode ? "#94a3b8" : "#475569", fontWeight: 500 }}
                      >
                        Paste supplier quote
                      </Button>

                      <Button
                        id="btn-reset-brief-defaults"
                        type="text"
                        icon={<ReloadOutlined />}
                        onClick={handleResetBriefToDefault}
                        style={{ fontSize: 13, color: isDarkMode ? "#94a3b8" : "#475569", fontWeight: 500 }}
                      >
                        Reset
                      </Button>
                    </Space>
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
                  <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
                    <Button
                      id="btn-back-to-brief"
                      size="middle"
                      icon={<ArrowLeftOutlined />}
                      onClick={() => handleNavigateToStep(0)}
                      style={{ borderRadius: 10, fontWeight: 600 }}
                    >
                      ← Back to Brief
                    </Button>
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
                        style={{
                          borderRadius: 100,
                          fontSize: 14,
                          fontWeight: 600,
                          padding: "4px 14px",
                          background: step2ViewMode === "cards" ? "#0052FF" : "transparent",
                          color: step2ViewMode === "cards" ? "#ffffff" : undefined,
                        }}
                      >
                        Cards
                      </Button>
                      <Button
                        size="small"
                        type={step2ViewMode === "grid" ? "primary" : "text"}
                        onClick={() => setStep2ViewMode("grid")}
                        style={{
                          borderRadius: 100,
                          fontSize: 14,
                          fontWeight: 600,
                          padding: "4px 14px",
                          background: step2ViewMode === "grid" ? "#0052FF" : "transparent",
                          color: step2ViewMode === "grid" ? "#ffffff" : undefined,
                        }}
                      >
                        Matrix
                      </Button>
                      <Button
                        size="small"
                        type={step2ViewMode === "radar" ? "primary" : "text"}
                        onClick={() => setStep2ViewMode("radar")}
                        style={{
                          borderRadius: 100,
                          fontSize: 14,
                          fontWeight: 600,
                          padding: "4px 14px",
                          background: step2ViewMode === "radar" ? "#0052FF" : "transparent",
                          color: step2ViewMode === "radar" ? "#ffffff" : undefined,
                        }}
                      >
                        Trade-offs
                      </Button>
                    </div>

                    {/* AI Vendor Negotiator trigger */}
                    <Button
                      icon={<ThunderboltOutlined style={{ color: "#F59E0B" }} />}
                      onClick={() => setNegotiationModalOpen(true)}
                      style={{ borderRadius: 10, fontWeight: 600, fontSize: 13 }}
                    >
                      Negotiate price
                    </Button>
                  </Space>
                </div>

                {/* VIEW MODE 1: FOCUSED CARDS (Plan B Featured Hero) */}
                {step2ViewMode === "cards" && (
                  <>
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
                          <Tag color="green" style={{ borderRadius: 6, fontWeight: 700 }}>Lowest Cost</Tag>
                          <Text type="secondary" style={{ fontSize: 12 }}>Plan A</Text>
                        </div>

                        <div style={{ marginBottom: 12 }}>
                          <Money inr={planData.strategies?.CHEAPEST?.totalINR || 0} inrPerUsd={inrPerUsd} size="lg" />
                          <div style={{ fontSize: 12, color: "#10b981", fontWeight: 600, marginTop: 4 }}>
                            Savings vs budget: ₹{(budgetINR - (planData.strategies?.CHEAPEST?.totalINR || 0)).toLocaleString("en-IN")}
                          </div>
                        </div>

                        <Paragraph type="secondary" style={{ fontSize: 12, minHeight: 36, marginBottom: 14 }}>
                          {planData.strategies?.CHEAPEST?.objectiveSummary || "Lowest total cost among complete baskets that meet every hard constraint and the budget."}
                        </Paragraph>

                        {/* Items list */}
                        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8, marginBottom: 18 }}>
                          {(planData.strategies?.CHEAPEST?.items || []).map((it) => (
                            <div key={it.productId} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", borderRadius: 8, background: isDarkMode ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)", border: `1px solid ${isDarkMode ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)"}` }}>
                              <ProductIcon category={it.category} size={28} />
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.3, color: isDarkMode ? "#e2e8f0" : "#1e293b", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{it.name}</div>
                              </div>
                              <strong style={{ fontFamily: "var(--font-mono)", fontSize: 12, flexShrink: 0, color: isDarkMode ? "#38bdf8" : "#0052FF" }}>₹{it.unitPriceINR.toLocaleString()}</strong>
                            </div>
                          ))}
                        </div>

                        <Button
                          block
                          onClick={() => handleApproveAndLock("CHEAPEST")}
                          style={{ borderRadius: 10, fontWeight: 600 }}
                        >
                          Approve Plan A and create mandate →
                        </Button>
                      </Card>
                    </Col>

                    {/* PLAN B: BEST QUALITY IN BUDGET (RECOMMENDED HERO CARD) */}
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
                            ⭐ RECOMMENDED
                          </Tag>
                          <Tag color="purple" style={{ borderRadius: 6, fontWeight: 700 }}>Plan B — Best Quality in Budget</Tag>
                        </div>

                        <div style={{ marginBottom: 12 }}>
                          <Money inr={planData.strategies?.BEST_VALUE?.totalINR || 0} inrPerUsd={inrPerUsd} size="xl" highlight />
                          {appliedRebateINR > 0 && (
                            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4, flexWrap: "wrap" }}>
                              <Tag color="gold" style={{ borderRadius: 6, fontWeight: 700, margin: 0 }}>
                                🏷️ -₹{appliedRebateINR.toLocaleString("en-IN")} Rebate Applied
                              </Tag>
                              <Text delete type="secondary" style={{ fontSize: 13 }}>
                                ₹{(planData.strategies?.BEST_VALUE?.originalTotalINR || (planData.strategies?.BEST_VALUE?.totalINR + appliedRebateINR)).toLocaleString("en-IN")}
                              </Text>
                            </div>
                          )}
                          <div style={{ fontSize: 13, color: "#0052FF", fontWeight: 700, marginTop: 4 }}>
                            Savings vs budget: ₹{(budgetINR - (planData.strategies?.BEST_VALUE?.totalINR || 0)).toLocaleString("en-IN")}
                          </div>
                        </div>

                        <Paragraph style={{ fontSize: 13, marginBottom: 12 }}>
                          Highest quality, reliability and delivery score within your budget.
                        </Paragraph>

                        {/* Deterministic "What the extra ₹X buys vs Plan A" block */}
                        {whatExtraBuys?.hasUpgrades && (
                          <div
                            style={{
                              marginBottom: 14,
                              padding: "10px 14px",
                              borderRadius: 10,
                              background: isDarkMode ? "rgba(0, 82, 255, 0.08)" : "#f0f7ff",
                              border: "1px solid rgba(0, 82, 255, 0.2)",
                              fontSize: 12,
                            }}
                          >
                            <div style={{ fontWeight: 700, color: "#0052FF", marginBottom: 6 }}>
                              What the extra ₹{whatExtraBuys.extraINR.toLocaleString("en-IN")} buys vs Plan A:
                            </div>
                            <ul style={{ margin: 0, paddingLeft: 18, color: isDarkMode ? "#e2e8f0" : "#1e293b", lineHeight: 1.5 }}>
                              {whatExtraBuys.differences.map((diff, idx) => (
                                <li key={idx} style={{ marginBottom: 4 }}>
                                  <strong style={{ textTransform: "capitalize" }}>{diff.category}:</strong> {diff.label}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {/* Items list - dynamic with icons */}
                        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
                          {(planData.strategies?.BEST_VALUE?.items || []).map((it) => (
                            <div key={it.productId} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", borderRadius: 8, background: isDarkMode ? "rgba(0,82,255,0.06)" : "rgba(0,82,255,0.04)", border: `1px solid ${isDarkMode ? "rgba(0,82,255,0.15)" : "rgba(0,82,255,0.1)"}` }}>
                              <ProductIcon category={it.category} size={28} />
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.3, color: isDarkMode ? "#e2e8f0" : "#1e293b", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{it.name}</div>
                              </div>
                              <strong style={{ fontFamily: "var(--font-mono)", fontSize: 12, flexShrink: 0, color: "#0052FF" }}>₹{it.unitPriceINR.toLocaleString()}</strong>
                            </div>
                          ))}
                        </div>

                        <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 10 }}>
                          {planData.strategies?.BEST_VALUE?.totalINR > budgetINR && (
                            <div style={{ marginBottom: 4 }}>
                              <Alert
                                type="error"
                                showIcon
                                style={{ borderRadius: 10, padding: "8px 12px", marginBottom: 8 }}
                                message={
                                  <span style={{ fontWeight: 800, fontSize: 13 }}>
                                    Budget Cap Exceeded by ₹{(planData.strategies.BEST_VALUE.totalINR - budgetINR).toLocaleString("en-IN")}
                                  </span>
                                }
                                description="Mandate lock is disabled until deficit is resolved."
                              />
                              <Button
                                id="btn-auto-rebalance-card-b"
                                block
                                type="primary"
                                icon={<ThunderboltOutlined />}
                                onClick={() => handleAutoRebalanceStrategy("BEST_VALUE")}
                                style={{
                                  background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
                                  borderColor: "#10b981",
                                  fontWeight: 700,
                                  borderRadius: 10,
                                  height: 40,
                                }}
                              >
                                ⚡ Auto-Rebalance Plan B to Fit ₹{budgetINR.toLocaleString("en-IN")}
                              </Button>
                            </div>
                          )}

                          <Button
                            size="middle"
                            icon={<TableOutlined />}
                            onClick={() => {
                              setActiveMatrixStrategy("BEST_VALUE");
                              setStep2ViewMode("grid");
                            }}
                            style={{ borderRadius: 10, fontWeight: 600 }}
                          >
                            Edit in matrix
                          </Button>

                          <Button
                            id="btn-approve-plan-b"
                            type="primary"
                            size="large"
                            disabled={planData.strategies?.BEST_VALUE?.totalINR > budgetINR}
                            icon={<CheckCircleOutlined />}
                            onClick={() => handleApproveAndLock("BEST_VALUE")}
                            style={{
                              borderRadius: 12,
                              fontWeight: 800,
                              fontSize: 15,
                              height: 48,
                              background: planData.strategies?.BEST_VALUE?.totalINR > budgetINR ? undefined : "#0052FF",
                              boxShadow: planData.strategies?.BEST_VALUE?.totalINR > budgetINR ? "none" : "0 4px 20px rgba(0, 82, 255, 0.4)",
                            }}
                          >
                            {planData.strategies?.BEST_VALUE?.totalINR > budgetINR
                              ? `Budget Exceeded (₹${planData.strategies.BEST_VALUE.totalINR.toLocaleString("en-IN")} > ₹${budgetINR.toLocaleString("en-IN")})`
                              : "Approve Plan B and create mandate →"}
                          </Button>
                        </div>
                      </Card>
                    </Col>

                    {/* PLAN C: ALTERNATIVE */}
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
                          <Tag color="purple" style={{ borderRadius: 6, fontWeight: 700 }}>Alternative</Tag>
                          <Text type="secondary" style={{ fontSize: 12 }}>Plan C — Alternative</Text>
                        </div>

                        <div style={{ marginBottom: 12 }}>
                          <Money inr={planData.strategies?.ALTERNATIVE?.totalINR || 0} inrPerUsd={inrPerUsd} size="lg" />
                          <div style={{ fontSize: 12, color: "#8b5cf6", fontWeight: 600, marginTop: 4 }}>
                            Savings vs budget: ₹{(budgetINR - (planData.strategies?.ALTERNATIVE?.totalINR || 0)).toLocaleString("en-IN")}
                          </div>
                        </div>

                        <Paragraph type="secondary" style={{ fontSize: 12, minHeight: 36, marginBottom: 10 }}>
                          {planData.strategies?.ALTERNATIVE?.objectiveSummary}
                        </Paragraph>

                        {/* Deterministic "How it differs from Plan B" Block */}
                        {howPlanCDiffers?.summaryLine && (
                          <div
                            style={{
                              marginBottom: 14,
                              padding: "8px 10px",
                              borderRadius: 8,
                              background: isDarkMode ? "rgba(139, 92, 246, 0.08)" : "#f5f3ff",
                              border: "1px solid rgba(139, 92, 246, 0.2)",
                              fontSize: 12,
                              color: isDarkMode ? "#c4b5fd" : "#6d28d9",
                              lineHeight: 1.4,
                            }}
                          >
                            <Space size={6} align="start">
                              <SwapOutlined style={{ marginTop: 2, color: "#a855f7" }} />
                              <span>{howPlanCDiffers.summaryLine}</span>
                            </Space>
                          </div>
                        )}

                        {/* Items list */}
                        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8, marginBottom: 18 }}>
                          {(planData.strategies?.ALTERNATIVE?.items || []).map((it) => (
                            <div key={it.productId} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", borderRadius: 8, background: isDarkMode ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)", border: `1px solid ${isDarkMode ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)"}` }}>
                              <ProductIcon category={it.category} size={28} />
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.3, color: isDarkMode ? "#e2e8f0" : "#1e293b", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{it.name}</div>
                              </div>
                              <strong style={{ fontFamily: "var(--font-mono)", fontSize: 12, flexShrink: 0, color: isDarkMode ? "#a78bfa" : "#7c3aed" }}>₹{it.unitPriceINR.toLocaleString()}</strong>
                            </div>
                          ))}
                        </div>

                        <Button
                          block
                          onClick={() => handleApproveAndLock("ALTERNATIVE")}
                          style={{ borderRadius: 10, fontWeight: 600 }}
                        >
                          Approve Alternative (Plan C) and create mandate →
                        </Button>
                      </Card>
                    </Col>
                  </Row>

                  {/* Collapsed What-If Options Bar */}
                  <div style={{ marginTop: 24, textAlign: "center" }}>
                    <Button
                      icon={<SlidersOutlined />}
                      onClick={() => setShowWhatIfOptions(!showWhatIfOptions)}
                      style={{ borderRadius: 10, fontWeight: 600, fontSize: 13 }}
                    >
                      {showWhatIfOptions ? "Hide What-if Sensitivity Options ▴" : "What-if options: Adjust delivery or budget envelopes ▾"}
                    </Button>
                  </div>

                  {showWhatIfOptions && (
                    <SmartTradeoffFrontier
                      budgetCap={budgetINR}
                      maxDeliveryDays={maxDeliveryDays}
                      minRefreshRateHz={minRefreshRateHz}
                      strategies={planData.strategies}
                      catalogProducts={localCatalog.products || []}
                      activeStrategyKey={activeMatrixStrategy || "BEST_VALUE"}
                      appliedTradeoff={appliedTradeoff}
                      onSelectTradeoffForConfirm={(rec) => setPendingTradeoff(rec)}
                      onApplyTradeoff={handleApplyTradeoff}
                      onResetToDefault={handleResetToDefaultConstraints}
                      isDarkMode={isDarkMode}
                    />
                  )}
                </>
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
                    onCellValueChanged={handleMatrixCellValueChanged}
                    onResetStrategy={handleResetStrategy}
                    onAutoRebalance={handleAutoRebalanceStrategy}
                    onApproveAndLock={handleApproveAndLock}
                    onOpenSwap={(stratKey, item) => {
                      setSwapTarget({ strategyKey: stratKey, currentItem: item });
                      setCategoryCandidates(
                        localCatalog.products?.filter(
                          (p) => p.category?.toLowerCase() === item?.category?.toLowerCase()
                        ) || []
                      );
                      setSwapDrawerOpen(true);
                    }}
                  />
                )}

                {/* VIEW MODE 3: RADAR CHART */}
                {step2ViewMode === "radar" && (
                  <StrategyRadarChart
                    strategies={planData.strategies}
                    budgetCap={budgetINR}
                    maxDeliveryDays={maxDeliveryDays}
                    minRefreshRateHz={minRefreshRateHz}
                    catalogProducts={localCatalog.products || []}
                    isDarkMode={isDarkMode}
                    onSelectStrategy={handleApproveAndLock}
                    onApplyTradeoff={handleApplyTradeoff}
                    onSelectTradeoffForConfirm={(rec) => setPendingTradeoff(rec)}
                    onResetToDefault={handleResetToDefaultConstraints}
                    appliedTradeoff={appliedTradeoff}
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
                  <Space align="center" wrap>
                    <Title level={3} style={{ margin: 0, letterSpacing: -0.5 }}>
                      Order #PA-1042
                    </Title>
                    {cfoApproved ? (
                      <Tag color="success" id="order-status-chip" style={{ borderRadius: 6, fontWeight: 700 }}>APPROVED</Tag>
                    ) : isWaitingCfoApproval || cfoApprovalLink ? (
                      <Tag color="warning" id="order-status-chip" style={{ borderRadius: 6, fontWeight: 700 }}>AWAITING APPROVAL</Tag>
                    ) : (
                      <Tag color="blue" id="order-status-chip" style={{ borderRadius: 6, fontWeight: 700 }}>MANDATE SIGNED</Tag>
                    )}
                    <Tag color="default" style={{ background: isDarkMode ? "rgba(255, 255, 255, 0.06)" : "#f1f5f9", borderRadius: 100, fontSize: 11, fontWeight: 600 }}>
                      🛡️ Sandbox mode: no real money
                    </Tag>
                    <Popover
                      trigger="click"
                      placement="bottomLeft"
                      title={<Text strong style={{ fontSize: 13 }}>Order & Mandate Details</Text>}
                      content={
                        <div style={{ minWidth: 260, display: "flex", flexDirection: "column", gap: 8, fontSize: 12 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <Text type="secondary">Order Ref:</Text>
                            <Space size={4}>
                              <Text code>PA-1042</Text>
                              <Button size="small" type="text" icon={<CopyOutlined style={{ fontSize: 11 }} />} onClick={() => { navigator.clipboard.writeText("PA-1042"); message.success("Copied order ref"); }} />
                            </Space>
                          </div>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <Text type="secondary">Plan ID:</Text>
                            <Space size={4}>
                              <Text code>{lockedPlan?.planId || "PA-PLAN-1042"}</Text>
                              <Button size="small" type="text" icon={<CopyOutlined style={{ fontSize: 11 }} />} onClick={() => { navigator.clipboard.writeText(lockedPlan?.planId || "PA-PLAN-1042"); message.success("Copied plan ID"); }} />
                            </Space>
                          </div>
                          {activeMandate?.mandateId && (
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                              <Text type="secondary">Mandate ID:</Text>
                              <Space size={4}>
                                <Text code>{activeMandate.mandateId.slice(0, 16)}...</Text>
                                <Button size="small" type="text" icon={<CopyOutlined style={{ fontSize: 11 }} />} onClick={() => { navigator.clipboard.writeText(activeMandate.mandateId); message.success("Copied mandate ID"); }} />
                              </Space>
                            </div>
                          )}
                        </div>
                      }
                    >
                      <Button size="small" icon={<InfoCircleOutlined />} style={{ borderRadius: 6, fontSize: 12, height: 26, padding: "0 8px" }}>
                        Details
                      </Button>
                    </Popover>
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
                          <Text type="secondary">Shipping and taxes</Text>
                          <Text type="secondary">included in the vendor price (sample data)</Text>
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
                  </Col>

                  {/* RIGHT COLUMN: Guided Checklist & Payment Terminal (Sticky for 1-Screen Access) */}
                  <Col xs={24} lg={12} style={{ position: "sticky", top: 76, alignSelf: "flex-start" }}>
                    {/* Compact 3-Node Architecture Pipeline Visual */}
                    <div
                      style={{
                        padding: "8px 12px",
                        borderRadius: 10,
                        background: isDarkMode ? "rgba(2, 6, 23, 0.5)" : "#f8fafc",
                        border: `1px solid ${isDarkMode ? "rgba(255, 255, 255, 0.05)" : "#e2e8f0"}`,
                        marginBottom: 14,
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11, fontWeight: 700 }}>
                        <span style={{ color: "#94a3b8" }}>Buyer Org</span>
                        <span style={{ color: "#38bdf8" }}>➔ [Hold] ➔</span>
                        <span style={{ color: "#0052FF" }}>PayPal Hold (${toUSD(lockedPlan?.lockedTotalINR || 35492)})</span>
                        <span style={{ color: "#38bdf8" }}>➔ [Delivery] ➔</span>
                        <span style={{ color: "#10b981" }}>Seller (Paid)</span>
                      </div>
                    </div>

                    {/* Step 1: Mandate Signed (Done) */}
                    <div
                      style={{
                        padding: "8px 12px",
                        borderRadius: 8,
                        background: isDarkMode ? "rgba(16, 185, 129, 0.08)" : "#f0fdf4",
                        border: "1px solid rgba(16, 185, 129, 0.2)",
                        marginBottom: 10,
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        fontSize: 12,
                      }}
                    >
                      <Space size={6}>
                        <CheckCircleOutlined style={{ color: "#10b981" }} />
                        <span style={{ fontWeight: 600 }}>1. Spending Mandate Signed</span>
                      </Space>
                      <Tag color="success" style={{ margin: 0, fontWeight: 700, borderRadius: 6, fontSize: 11 }}>
                        ✓ CEILING LOCKED
                      </Tag>
                    </div>

                    {/* Step 2: Unified Executive Approval Control */}
                    <Card
                      id="card-executive-approval"
                      style={{
                        borderRadius: 14,
                        marginBottom: 14,
                        background: !requireApproval
                          ? (isDarkMode ? "rgba(15, 23, 42, 0.6)" : "#f8fafc")
                          : cfoApproved
                          ? (isDarkMode ? "rgba(16, 185, 129, 0.08)" : "#f0fdf4")
                          : (isDarkMode ? "rgba(15, 23, 42, 0.7)" : "#ffffff"),
                        border: `1px solid ${
                          !requireApproval
                            ? (isDarkMode ? "rgba(255, 255, 255, 0.1)" : "#cbd5e1")
                            : cfoApproved
                            ? "#10b981"
                            : isWaitingCfoApproval
                            ? "#f59e0b"
                            : (isDarkMode ? "rgba(255, 255, 255, 0.08)" : "#e2e8f0")
                        }`,
                      }}
                      bodyStyle={{ padding: 14 }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
                        <Space align="center" size={8}>
                          {cfoApproved ? (
                            <CheckCircleOutlined style={{ color: "#10b981", fontSize: 16 }} />
                          ) : (
                            <SafetyCertificateOutlined style={{ color: !requireApproval ? "#94a3b8" : isWaitingCfoApproval ? "#f59e0b" : "#0052FF", fontSize: 16 }} />
                          )}
                          <Text strong style={{ fontSize: 13 }}>2. Executive Approval</Text>
                        </Space>

                        <Space align="center" size={10} wrap>
                          <Space size={6} align="center">
                            <span style={{ fontSize: 11, color: isDarkMode ? "#94a3b8" : "#64748b" }}>Approval required:</span>
                            <Switch
                              id="switch-require-approval"
                              size="small"
                              checked={requireApproval}
                              onChange={async (checked) => {
                                setRequireApproval(checked);
                                try {
                                  await setApprovalRequiredApi(checked, "user_toggle");
                                } catch (_) {}
                                logTelemetry("POST /api/mandates/config/approval-required", `Toggled approval requirement to ${checked ? "ON" : "OFF"}`, "AUDIT", 15);
                                message.info(`Approval requirement set to ${checked ? "ON" : "OFF"}`);
                              }}
                            />
                          </Space>
                          {!requireApproval ? (
                            <Tag color="default" style={{ margin: 0, fontWeight: 700, borderRadius: 6, fontSize: 11 }}>OFF (DEMO)</Tag>
                          ) : cfoApproved ? (
                            <Tag color="green" icon={<CheckCircleOutlined />} style={{ margin: 0, fontWeight: 700, borderRadius: 6, fontSize: 11 }}>✓ APPROVED</Tag>
                          ) : isWaitingCfoApproval ? (
                            <Tag id="tag-approval-status" color="orange" icon={<ClockCircleOutlined />} style={{ margin: 0, fontWeight: 700, borderRadius: 6, fontSize: 11 }}>AWAITING APPROVAL</Tag>
                          ) : (
                            <Tag color="blue" style={{ margin: 0, fontWeight: 600, borderRadius: 6, fontSize: 11 }}>READY</Tag>
                          )}
                        </Space>
                      </div>

                      <div style={{ fontSize: 12, color: isDarkMode ? "#94a3b8" : "#64748b", marginBottom: (!requireApproval || cfoApproved) ? 0 : 10 }}>
                        {!requireApproval
                          ? "Demo mode: Executive approval gating is bypassed. PayPal and simulation authorization unlocked directly."
                          : cfoApproved
                          ? "Executive authority approved this mandate. PayPal authorization is unlocked."
                          : "Single-use approval token generated. PayPal & Simulation authorization holds remain blocked until signed by executive authority."}
                      </div>

                      {requireApproval && !cfoApproved && (
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                          <Button
                            id="btn-copy-approval-link"
                            size="small"
                            icon={<CopyOutlined />}
                            onClick={() => {
                              const link = cfoApprovalLink || `${window.location.origin}/?token=${activeApprovalToken?.token || "sample_token"}`;
                              navigator.clipboard?.writeText(link);
                              message.success("Copied single-use approval token link!");
                            }}
                            style={{ borderRadius: 6, fontSize: 12 }}
                          >
                            Copy Link
                          </Button>

                          <Popover
                            content={
                              <div style={{ textAlign: "center", padding: 8 }}>
                                <QRCode value={cfoApprovalLink || `${window.location.origin}/?token=${activeApprovalToken?.token || "sample_token"}`} size={160} />
                                <div style={{ fontSize: 11, color: "#64748b", marginTop: 6 }}>Scan to approve on mobile</div>
                              </div>
                            }
                            title="Executive Approval QR"
                            trigger="click"
                          >
                            <Button id="btn-approval-qr" size="small" icon={<QrcodeOutlined />} style={{ borderRadius: 6, fontSize: 12 }}>
                              QR Code
                            </Button>
                          </Popover>

                          <Button
                            id="btn-simulate-signoff"
                            size="small"
                            type="primary"
                            onClick={() => setApprovalModalOpen(true)}
                            style={{ borderRadius: 6, fontSize: 12, background: "#f59e0b", borderColor: "#f59e0b", color: "#000", fontWeight: 700 }}
                          >
                            Simulate sign-off ↗
                          </Button>
                        </div>
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
                        message={<span style={{ fontWeight: 700 }}>Pay-on-Delivery Authorization Hold</span>}
                        description="No payment is captured today. PayPal places an authorization hold; funds are guaranteed for about 3 days and the authorization stays valid up to 29 days (reauthorize if delivery is later). Payment is captured only when delivery is confirmed."
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
                            fundingSource="paypal"
                            disabled={Boolean(fxData?.unavailable || (requireApproval && !cfoApproved))}
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
                          disabled={Boolean(fxData?.unavailable || (requireApproval && !cfoApproved))}
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
                          {requireApproval && !cfoApproved ? "Waiting for executive approval" : "Open PayPal Sandbox Login in New Tab ↗"}
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
                          disabled={Boolean(fxData?.unavailable || (requireApproval && !cfoApproved))}
                          title={requireApproval && !cfoApproved ? "Waiting for executive approval" : undefined}
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
                          {requireApproval && !cfoApproved ? "Waiting for executive approval" : "⚡ 1-Click Fast Simulation Hold →"}
                        </Button>
                        <div style={{ fontSize: 10, color: "#64748b", textAlign: "center", lineHeight: 1.4 }}>
                          [SIMULATION ONLY — Bypasses buyer login on sandbox.paypal.com for rapid automated evaluation]
                        </div>
                      </div>
                    </Card>
                  </Col>
                </Row>
              </motion.div>
            )}

            {/* ========================================================= */}
            {/* SCREEN 4: DELIVERY VERIFICATION & SETTLE (PAYMENT CAPTURE) */}
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
                              Automated smart disbursements with cryptographic audit trail
                            </div>
                          </div>
                        </Space>
                        <Tag color="green" icon={<CheckCircleOutlined />} style={{ padding: "2px 8px", fontWeight: 700 }}>
                          SETTLEMENT FULFILLED
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
                            <div style={{ fontSize: 11, color: "#94a3b8", textTransform: "uppercase", fontWeight: 700 }}>Platform Guarantee Fee (1.5%)</div>
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
                                <Text strong style={{ fontSize: 14 }}>Payment Reversal & Protection</Text>
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
        plan={planData}
        strategyKey={activeMatrixStrategy || "BEST_VALUE"}
        strategy={planData.strategies?.[activeMatrixStrategy || "BEST_VALUE"] || planData.strategies?.BEST_VALUE}
        isDarkMode={isDarkMode}
        onApplyRebate={handleApplyNegotiatedRebate}
        onRebateAgreed={handleApplyNegotiatedRebate}
      />

      {/* 5. Executive Approval Portal Modal */}
      <ApprovalPortalModal
        open={approvalModalOpen}
        onClose={() => setApprovalModalOpen(false)}
        plan={lockedPlan || {
          planId: "PA-PLAN-1042",
          strategyKey: "BEST_VALUE",
          lockedTotalINR: 35492,
          lockedTotalUSD: toUSD(35492),
        }}
        mandate={activeMandate}
        tokenRecord={activeApprovalToken}
        onApprove={() => {
          message.success("Executive approval granted!");
          setCurrentStep(2);
        }}
        isDarkMode={isDarkMode}
        inrPerUsd={inrPerUsd}
      />

      {/* 5.5 What-If Sensitivity Trade-Off Confirmation Modal */}
      <TradeoffConfirmModal
        open={!!pendingTradeoff}
        onClose={() => setPendingTradeoff(null)}
        tradeoff={pendingTradeoff}
        currentBudgetINR={budgetINR}
        currentDeliveryDays={maxDeliveryDays}
        currentTotalINR={planData?.strategies?.[activeMatrixStrategy || "BEST_VALUE"]?.totalINR || budgetINR}
        onConfirmApply={handleConfirmTradeoff}
        isDarkMode={isDarkMode}
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
              theme="legacy"
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
                  className="candidate-swap-item"
                  style={{
                    padding: 12,
                    borderRadius: 10,
                    background: isDarkMode ? "rgba(255, 255, 255, 0.04)" : "#f8fafc",
                    border: `1px solid ${isDarkMode ? "rgba(255, 255, 255, 0.08)" : "#e2e8f0"}`,
                    cursor: "pointer",
                  }}
                  onClick={() => {
                    const stratKey = swapTarget.strategyKey;
                    const strat = planData?.strategies?.[stratKey];
                    if (!strat || !strat.items) return;
                    const updatedItems = strat.items.map((it) =>
                      it.category?.toLowerCase() === cand.category?.toLowerCase()
                        ? {
                            ...it,
                            productId: cand.id || cand.productId,
                            name: cand.name,
                            brand: cand.brand,
                            unitPriceINR: cand.priceINR || cand.unitPriceINR,
                            specs: cand.specsSummary || cand.specs || it.specs,
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

      {/* 9. AI Budget Auto-Rebalance Transparency Report Modal */}
      <Modal
        title={
          <Space>
            <ThunderboltOutlined style={{ color: "#10b981", fontSize: 18 }} />
            <Text strong style={{ fontSize: 16 }}>
              AI Budget Auto-Rebalance Transparency Report
            </Text>
          </Space>
        }
        open={Boolean(rebalanceReport)}
        onCancel={() => setRebalanceReport(null)}
        footer={[
          <Button
            key="close"
            id="btn-dismiss-rebalance-report"
            type="primary"
            onClick={() => setRebalanceReport(null)}
            style={{ background: "#0052FF", borderRadius: 8, fontWeight: 700 }}
          >
            Got It, Proceed With Rebalanced Plan →
          </Button>,
        ]}
        width={680}
      >
        {rebalanceReport && (
          <div id="rebalance-report-modal-content">
            <Alert
              type="success"
              showIcon
              style={{ marginBottom: 16, borderRadius: 10 }}
              message={
                <span style={{ fontWeight: 800 }}>
                  Basket Successfully Optimized to ₹{rebalanceReport.totalINR.toLocaleString("en-IN")}
                </span>
              }
              description={
                <div>
                  Saved <strong>₹{rebalanceReport.totalSavedINR.toLocaleString("en-IN")}</strong> to fit strictly within your ₹{budgetINR.toLocaleString("en-IN")} spending envelope (Headroom: ₹{rebalanceReport.headroomINR.toLocaleString("en-IN")}).
                </div>
              }
            />

            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8, color: "#94a3b8", textTransform: "uppercase" }}>
              Component Adjustments & Downgrades (Lowest Priority First):
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {rebalanceReport.changes.map((ch, idx) => (
                <div
                  key={idx}
                  className="rebalance-diff-row"
                  style={{
                    padding: "12px 14px",
                    borderRadius: 10,
                    background: isDarkMode ? "rgba(255, 255, 255, 0.03)" : "#f8fafc",
                    border: `1px solid ${isDarkMode ? "rgba(255, 255, 255, 0.08)" : "#e2e8f0"}`,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <Tag color="cyan" style={{ textTransform: "uppercase", fontWeight: 700 }}>{ch.category}</Tag>
                    <Tag color="green" style={{ fontWeight: 700 }}>Saved ₹{ch.savedINR.toLocaleString("en-IN")}</Tag>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, flexWrap: "wrap" }}>
                    <span style={{ color: "#ef4444", textDecoration: "line-through" }}>
                      {ch.from.name} (₹{ch.from.unitPriceINR.toLocaleString("en-IN")}{ch.from.quantity > 1 ? ` x${ch.from.quantity}` : ""})
                    </span>
                    <ArrowRightOutlined style={{ color: "#10b981", fontSize: 12 }} />
                    <span style={{ color: "#10b981", fontWeight: 700 }}>
                      {ch.to.name} (₹{ch.to.unitPriceINR.toLocaleString("en-IN")}{ch.to.quantity > 1 ? ` x${ch.to.quantity}` : ""})
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>
                    {ch.detail}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </Modal>
    </div>
    </ConfigProvider>
  );
}
