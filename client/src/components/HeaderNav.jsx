// client/src/components/HeaderNav.jsx
import React from "react";
import { Typography, Tag, Button, Tooltip, Dropdown } from "antd";
import {
  CompassOutlined,
  AppstoreOutlined,
  SunOutlined,
  MoonOutlined,
  RocketOutlined,
  CheckCircleOutlined,
} from "@ant-design/icons";

const { Text } = Typography;

export default function HeaderNav({
  currentStep = 0,
  onStepChange,
  isDarkMode = true,
  onToggleDarkMode,
  bgQuality = "full",
  onChangeBgQuality,
  fxData = {},
  onOpenTools,
  onTriggerPreset,
}) {
  const steps = [
    { num: 0, label: "Request", short: "1. Brief" },
    { num: 1, label: "Plans", short: "2. Plans" },
    { num: 2, label: "Authorize", short: "3. Mandate" },
    { num: 3, label: "Settle", short: "4. Settle" },
  ];

  const inrPerUsd = fxData?.inrPerUsd || 94.93;
  const fxSource = fxData?.source || "open.er-api.com";
  const fxTime = fxData?.timestamp
    ? new Date(fxData.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : "Live";

  const presetMenuItems = [
    {
      key: "1",
      label: "1️⃣ Request: ₹60k Setup & AI Parse",
      onClick: () => onTriggerPreset(1),
    },
    {
      key: "2",
      label: "2️⃣ AG Grid Live Matrix (Sponsor Showcase)",
      onClick: () => onTriggerPreset(2),
    },
    {
      key: "3",
      label: "3️⃣ AI Vendor Negotiation (-5% Margin)",
      onClick: () => onTriggerPreset(3),
    },
    {
      key: "4",
      label: "4️⃣ Mandate & Pay-on-Delivery Hold",
      onClick: () => onTriggerPreset(4),
    },
    {
      key: "5",
      label: "5️⃣ Retailer Price Spike Safety Lock",
      onClick: () => onTriggerPreset(5),
    },
  ];

  return (
    <header
      style={{
        position: "sticky",
        top: 0,
        zIndex: 100,
        height: 56,
        width: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 16px",
        background: isDarkMode ? "rgba(11, 17, 32, 0.96)" : "rgba(255, 255, 255, 0.96)",
        backdropFilter: "blur(14px)",
        borderBottom: `1px solid ${isDarkMode ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 0, 0, 0.08)"}`,
      }}
    >
      {/* LEFT: BRAND */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
        <div
          onClick={() => onStepChange(0)}
          style={{ display: "flex", alignItems: "center", gap: 7, cursor: "pointer" }}
        >
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 8,
              background: "linear-gradient(135deg, #0052FF 0%, #0070BA 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 2px 8px rgba(0, 82, 255, 0.35)",
            }}
          >
            <CompassOutlined style={{ color: "#ffffff", fontSize: 16 }} />
          </div>
          <span style={{ fontWeight: 800, fontSize: 16, letterSpacing: "-0.03em" }}>
            Procure<span style={{ color: "#0052FF" }}>AI</span>
          </span>
        </div>
      </div>

      {/* CENTER: STREAMLINED STEPPER (Responsive) */}
      {/* Desktop Stepper */}
      <div
        className="header-stepper-desktop"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          background: isDarkMode ? "rgba(255, 255, 255, 0.04)" : "rgba(0, 0, 0, 0.04)",
          padding: "3px 6px",
          borderRadius: 100,
          border: `1px solid ${isDarkMode ? "rgba(255, 255, 255, 0.06)" : "rgba(0, 0, 0, 0.06)"}`,
        }}
      >
        {steps.map((s) => {
          const isActive = currentStep === s.num;
          const isDone = currentStep > s.num;
          return (
            <button
              key={s.num}
              onClick={() => {
                if (isDone || isActive) onStepChange(s.num);
              }}
              className={isActive ? "header-step-active" : ""}
              style={{
                border: "none",
                background: isActive
                  ? "#0052FF"
                  : isDone
                  ? isDarkMode ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 0, 0, 0.06)"
                  : "transparent",
                color: isActive
                  ? "#ffffff"
                  : isDone
                  ? isDarkMode ? "#e2e8f0" : "#1e293b"
                  : "#94a3b8",
                padding: "3px 10px",
                borderRadius: 100,
                fontSize: 11,
                fontWeight: isActive ? 700 : 500,
                cursor: isDone || isActive ? "pointer" : "default",
                display: "flex",
                alignItems: "center",
                gap: 4,
                transition: "all 0.15s ease",
              }}
            >
              {isDone ? <CheckCircleOutlined style={{ color: "#10b981", fontSize: 10 }} /> : null}
              {s.short}
            </button>
          );
        })}
      </div>

      {/* Mobile Stepper (Pill indicator) */}
      <div
        className="header-stepper-mobile"
        style={{
          display: "none",
          alignItems: "center",
          padding: "2px 8px",
          borderRadius: 100,
          background: isDarkMode ? "rgba(0, 82, 255, 0.15)" : "#eff6ff",
          fontSize: 11,
          fontWeight: 700,
          color: "#0052FF",
        }}
      >
        Step {currentStep + 1} of 4: {steps[currentStep].label}
      </div>

      {/* RIGHT: ACTIONS & CONTROLS */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
        {/* FX Rate Pill (Desktop) */}
        <Tooltip title={`Source: ${fxSource} • Updated: ${fxTime} • Direction: 1 USD = ${inrPerUsd} INR`}>
          <div
            className="header-fx-pill"
            style={{
              padding: "3px 8px",
              borderRadius: 6,
              fontSize: 11,
              fontWeight: 600,
              background: isDarkMode ? "rgba(255, 255, 255, 0.05)" : "rgba(0, 0, 0, 0.04)",
              border: `1px solid ${isDarkMode ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 0, 0, 0.08)"}`,
              fontFamily: "ui-monospace, monospace",
              cursor: "pointer",
            }}
          >
            1 USD = ₹{inrPerUsd.toFixed(2)}
          </div>
        </Tooltip>

        {/* Demo Presets (Desktop) */}
        <div className="header-presets-btn">
          <Dropdown menu={{ items: presetMenuItems }} placement="bottomRight" trigger={["click"]}>
            <Button
              size="small"
              icon={<RocketOutlined style={{ color: "#0052FF" }} />}
              style={{ borderRadius: 6, fontWeight: 600, fontSize: 11, padding: "0 8px" }}
            >
              Presets
            </Button>
          </Dropdown>
        </div>

        {/* Tools Drawer Trigger (Cmd+K) */}
        <Button
          type="primary"
          size="small"
          icon={<AppstoreOutlined />}
          onClick={onOpenTools}
          style={{
            borderRadius: 6,
            fontWeight: 600,
            fontSize: 11,
            background: "#0052FF",
            padding: "0 8px",
          }}
        >
          Tools
        </Button>

        {/* 3D / 2D / Off switch */}
        <Button
          size="small"
          style={{
            borderRadius: 6,
            fontSize: 10,
            fontWeight: 800,
            padding: "0 6px",
          }}
          onClick={() => {
            const next = bgQuality === "full" ? "lite" : bgQuality === "lite" ? "off" : "full";
            onChangeBgQuality(next);
          }}
        >
          {bgQuality === "full" ? "3D" : bgQuality === "lite" ? "2D" : "OFF"}
        </Button>

        {/* Dark / Light Toggle */}
        <Button
          size="small"
          icon={isDarkMode ? <SunOutlined /> : <MoonOutlined />}
          onClick={onToggleDarkMode}
          style={{ borderRadius: 6, padding: "0 6px" }}
        />
      </div>
    </header>
  );
}
