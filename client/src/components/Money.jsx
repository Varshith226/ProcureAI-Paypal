// client/src/components/Money.jsx
import React from "react";

export default function Money({
  inr,
  usd,
  inrPerUsd = 94.93,
  size = "md", // "sm" | "md" | "lg" | "xl"
  highlight = false,
  showUsd = true,
  direction = "row", // "row" | "column"
  style = {},
}) {
  const numericINR = Number(inr) || 0;
  const numericUSD = usd !== undefined && usd !== null
    ? Number(usd).toFixed(2)
    : (numericINR / (inrPerUsd || 94.93)).toFixed(2);

  const formattedINR = `₹${numericINR.toLocaleString("en-IN")}`;
  const formattedUSD = `$${numericUSD} USD`;

  const fontSizes = {
    sm: { inr: 13, usd: 11 },
    md: { inr: 16, usd: 12 },
    lg: { inr: 22, usd: 13 },
    xl: { inr: 28, usd: 14 },
  };

  const currentSize = fontSizes[size] || fontSizes.md;

  return (
    <div
      style={{
        display: "inline-flex",
        flexDirection: direction === "column" ? "column" : "row",
        alignItems: direction === "column" ? "flex-start" : "baseline",
        gap: direction === "column" ? 2 : 8,
        flexWrap: "wrap",
        ...style,
      }}
    >
      <span
        style={{
          fontSize: currentSize.inr,
          fontWeight: 800,
          color: highlight ? "#0052FF" : "inherit",
          letterSpacing: "-0.02em",
          lineHeight: 1.2,
          fontFeatureSettings: '"tnum"',
        }}
      >
        {formattedINR}
      </span>

      {showUsd && (
        <span
          style={{
            fontSize: currentSize.usd,
            fontWeight: 500,
            color: "#94a3b8",
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
            letterSpacing: "0.01em",
            whiteSpace: "nowrap",
          }}
        >
          {formattedUSD}
        </span>
      )}
    </div>
  );
}
