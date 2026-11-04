import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';

import { ModuleRegistry, AllCommunityModule, ValidationModule } from "ag-grid-community";
ModuleRegistry.registerModules([AllCommunityModule, ValidationModule]);

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#080c18",
          color: "#f8fafc",
          fontFamily: "system-ui, sans-serif",
          padding: 24,
          textAlign: "center"
        }}>
          <div style={{
            maxWidth: 500,
            padding: 32,
            background: "rgba(15, 23, 42, 0.9)",
            borderRadius: 16,
            border: "1px solid rgba(255, 255, 255, 0.1)",
            boxShadow: "0 20px 40px rgba(0,0,0,0.5)"
          }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>⚠️</div>
            <h2 style={{ fontSize: 20, marginBottom: 8, color: "#38bdf8" }}>ProcureAI Application Recovered</h2>
            <p style={{ fontSize: 13, color: "#94a3b8", marginBottom: 20 }}>
              An interface rendering anomaly occurred: {this.state.error?.message || "Unknown error"}
            </p>
            <button
              onClick={() => {
                this.setState({ hasError: false, error: null });
                window.location.reload();
              }}
              style={{
                background: "#0052FF",
                color: "#fff",
                border: "none",
                borderRadius: 8,
                padding: "10px 20px",
                fontWeight: 600,
                cursor: "pointer",
                fontSize: 14
              }}
            >
              Reload Application ↻
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
