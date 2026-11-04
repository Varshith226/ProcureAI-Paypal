// client/src/components/PlanMatrixGrid.jsx
import React, { useMemo, useRef } from "react";
import { AgGridReact } from "ag-grid-react";
import { Typography, Tag } from "antd";

const { Text } = Typography;

export default function PlanMatrixGrid({
  items = [],
  onQuantityChange,
  isDarkMode = true,
  inrPerUsd = 94.93,
}) {
  const gridRef = useRef();

  const rowData = useMemo(() => {
    return items.map((it) => {
      const lineINR = (Number(it.unitPriceINR) || 0) * (Number(it.quantity) || 1);
      const lineUSD = (lineINR / (inrPerUsd || 94.93)).toFixed(2);
      return {
        ...it,
        lineTotalINR: lineINR,
        lineTotalUSD: lineUSD,
      };
    });
  }, [items, inrPerUsd]);

  const totalPaise = rowData.reduce((sum, it) => sum + it.lineTotalINR, 0);
  const totalUSD = (totalPaise / (inrPerUsd || 94.93)).toFixed(2);

  const pinnedBottomRowData = useMemo(() => [
    {
      name: "Total Plan Commitment",
      quantity: rowData.reduce((sum, it) => sum + (Number(it.quantity) || 1), 0),
      unitPriceINR: null,
      lineTotalINR: totalPaise,
      lineTotalUSD: totalUSD,
      specs: "Authoritative Pinned Settlement",
    }
  ], [rowData, totalPaise, totalUSD]);

  const columnDefs = useMemo(() => [
    {
      headerName: "Category",
      field: "category",
      width: 130,
      cellRenderer: (p) => (
        <Tag color="blue">{String(p.value || "item").toUpperCase()}</Tag>
      ),
    },
    {
      headerName: "Product Name",
      field: "name",
      flex: 1,
      minWidth: 200,
      cellRenderer: (p) => (
        <span style={{ fontWeight: 600 }}>{p.value}</span>
      ),
    },
    {
      headerName: "Specs / Verification",
      field: "specs",
      width: 180,
      cellDataType: false,
      valueFormatter: (p) => {
        if (typeof p.value === "string") return p.value;
        if (p.value && typeof p.value === "object") {
          return Object.entries(p.value).map(([k, v]) => `${k}: ${v}`).join(" · ");
        }
        if (p.data?.verification?.checksPassed?.length) {
          return p.data.verification.checksPassed.join(" · ");
        }
        return "Verified";
      },
      cellRenderer: (p) => {
        let text = "Verified";
        if (typeof p.value === "string") {
          text = p.value;
        } else if (p.value && typeof p.value === "object") {
          text = Object.entries(p.value).map(([k, v]) => `${k}: ${v}`).join(" · ");
        } else if (p.data?.verification?.checksPassed?.length) {
          text = p.data.verification.checksPassed.join(" · ");
        }
        return (
          <Text type="secondary" style={{ fontSize: 11 }}>
            {text}
          </Text>
        );
      },
    },
    {
      headerName: "Qty",
      field: "quantity",
      width: 90,
      editable: (p) => !p.node?.isRowPinned?.(),
      cellEditor: "agNumberCellEditor",
      cellEditorParams: { min: 1, max: 20, precision: 0 },
      onCellValueChanged: (params) => {
        if (onQuantityChange) {
          onQuantityChange(params.data?.productId, Number(params.newValue) || 1);
        }
      },
      cellStyle: (p) => p.node?.isRowPinned?.() ? { fontWeight: 800 } : { background: isDarkMode ? "rgba(0,82,255,0.08)" : "#eff6ff", fontWeight: 700 },
    },
    {
      headerName: "Unit Price",
      field: "unitPriceINR",
      width: 120,
      cellRenderer: (p) => p.value !== null ? `₹${Number(p.value).toLocaleString("en-IN")}` : "",
    },
    {
      headerName: "Line Total (INR)",
      field: "lineTotalINR",
      width: 140,
      cellRenderer: (p) => (
        <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700 }}>
          ₹{Number(p.value).toLocaleString("en-IN")}
        </span>
      ),
    },
    {
      headerName: "USD Settlement",
      field: "lineTotalUSD",
      width: 140,
      cellRenderer: (p) => (
        <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: "#0052FF" }}>
          ${p.value} USD
        </span>
      ),
    },
  ], [isDarkMode, onQuantityChange]);

  const defaultColDef = useMemo(() => ({
    resizable: true,
    sortable: true,
  }), []);

  return (
    <div className="ag-grid-responsive-container">
      <div
        className={isDarkMode ? "ag-theme-quartz-dark" : "ag-theme-quartz"}
        style={{ height: 260, width: "100%", minWidth: 640, borderRadius: 12, overflow: "hidden", marginBottom: 16 }}
      >
        <AgGridReact
          ref={gridRef}
          theme="legacy"
          rowData={rowData}
          columnDefs={columnDefs}
          defaultColDef={defaultColDef}
          pinnedBottomRowData={pinnedBottomRowData}
        />
      </div>
    </div>
  );
}
