# ProcureAI: Autonomous AI Procurement Agent
### Powered by PayPal Pay-on-Delivery Authorization Holds & Cryptographic Spending Mandates

[![Hackathon](https://img.shields.io/badge/Hackathon-Build_What's_Next_with_PayPal_%26_AI-0052FF.svg)](https://paypalaihackathon.devpost.com/)
[![Tests](https://img.shields.io/badge/Tests-204_Passing-10b981.svg)](test/)
[![PayPal Sandbox](https://img.shields.io/badge/PayPal-Authorize--then--Capture-003087.svg)](https://developer.paypal.com/)
[![AI Model](https://img.shields.io/badge/AI-Google_Gemini_2.5_Flash-8b5cf6.svg)](https://ai.google.dev/)
[![AG Grid](https://img.shields.io/badge/AG_Grid-Community_v36-00e5ff.svg)](https://www.ag-grid.com/)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Deployment](https://img.shields.io/badge/Deploy-Render-46E3B7.svg)](https://paypal-ai-hackathon.onrender.com)

> **"ProcureAI is an autonomous AI procurement agent that purchases hardware on your behalf under an Ed25519 cryptographic spending mandate, with PayPal holding the funds in a pay-on-delivery authorization hold until the goods are delivered and inspected."**

---

## 1. The Real-World Problem & Target Audience

### The Target Audience
Small businesses, fast-growing tech startups (5–50 employees), design agencies, and educational institutions in India.

### The Problem
Equipping a team of developers or designers requires buying 5–20 workstations (monitors, mechanical keyboards, laptops, noise-canceling headsets). Today, the purchasing flow is broken:
- **WhatsApp Chaos:** Office managers negotiate with unverified local vendors over WhatsApp chat and fragmented PDF proformas.
- **100% Upfront Risk:** Vendors demand 100% upfront payment via wire transfer.
- **Zero Recourse:** When boxes arrive 10 days late or contain 75Hz monitors instead of the requested 144Hz displays, the buyer has zero leverage. The money is already gone.
- **No Governance:** Unregulated employee spending without mathematical budget ceilings.

### The Solution: ProcureAI
ProcureAI turns natural language procurement into a secure, pay-on-delivery authorization-backed commerce lifecycle. The agent finds constraint-verified hardware, negotiates volume discounts against private vendor margin floors, locks the agreement in an **Ed25519-signed Cryptographic Spending Mandate**, issues **Single-Use Expiring Approval Tokens** for remote CFO sign-off, and initiates a **PayPal Authorize-then-Capture** authorization hold. **Funds are captured only when physical delivery inspection is confirmed.**

---

## 2. End-to-End Architecture

```mermaid
flowchart TD
    User["Operations Lead / Founder<br>('Set up 5 workstations under ₹3 lakh')"] -->|Natural Language| AI["Google Gemini 2.5 Flash<br>(Intent & Constraint Extraction)"]
    
    AI -->|Structured Constraints| Verifier["Deterministic Verifier & Optimizer<br>(Zero Math in LLM · Rejection Transparency)"]
    
    Catalog["Channel3 / Merchant Feeds<br>(Live Retailer or Sample Catalog)"] -->|Specs & Inventory| Verifier
    
    Verifier -->|3 Verified Plans<br>(Cheapest · Best Value · Fastest)| Neg["Two-Agent Autonomous Negotiation<br>(Buyer LLM vs Vendor Floor Policy)"]
    
    Neg -->|Agreed Discount & Terms| Mandate["Ed25519 Cryptographic Spending Mandate<br>(Hard Ceiling · Merchant · Nonce · Signature)"]
    
    Mandate -->|Single-Use Expiring Token| Approver["Executive Remote Approval Portal<br>(Bound to Mandate & Plan Version)"]
    
    Approver -->|Interactive Matrix| AGGrid["AG Grid Community Data Matrix<br>(Inline Quantity Editing · Pinned Totals)"]
    
    AGGrid -->|Enforce Mandate Ceiling| PPAuth["PayPal Orders v2 (intent: AUTHORIZE)<br>(Funds Held in Authorization Hold up to 29 Days)"]
    
    PPAuth -->|Physical Inspection Confirmed| PPCapture["PayPal Payments v2 Capture<br>(Or SLA Credit Partial Capture: 90% capture / 10% void)"]
    
    PPCapture -->|Automated Payout - 1.5% Fee| PPPayout["PayPal Payouts v1 (Simulation Fallback / Region Restricted)"]
    PPCapture -->|Itemized Tax Invoice| PPInvoice["PayPal Invoicing v2 (Draft Tax Invoice)"]
    
    subgraph DataPersistence ["Persistence & Audit Trail"]
        DB[(SQLite WAL Engine)]
        AuditLog["Cryptographic SHA-256 Hash Chain"]
        SSE["Server-Sent Events (/api/events)"]
    end
    
    PPAuth -.-> DataPersistence
    PPCapture -.-> DataPersistence
    PPPayout -.-> DataPersistence
```

---

## 3. How PayPal is Used (Deep Platform Implementation)

ProcureAI utilizes a complete B2B pay-on-delivery authorization hold and settlement lifecycle built on official PayPal Sandbox APIs:

| PayPal API / Capability | Endpoint Used | Purpose in ProcureAI |
|---|---|---|
| **Orders v2 (Authorize Intent)** | `POST /v2/checkout/orders` with `intent: "AUTHORIZE"` | Creates orders that **hold funds in an authorization hold** rather than capturing immediately. Gives buyers 100% protection against delayed or defective goods. |
| **Orders v2 (Authorize Call)** | `POST /v2/checkout/orders/:id/authorize` | Authorizes the held amount after buyer approval, establishing a 29-day validity window with PayPal `authorization_id`. |
| **Payments v2 (Capture)** | `POST /v2/payments/authorizations/:id/capture` | Captures held funds atomically upon physical delivery confirmation and inspection sign-off. |
| **Atomic SLA Penalty Capture** | `POST /v2/payments/authorizations/:id/capture` with `final_capture: true` | On SLA delivery slippage, captures only 90% and automatically voids the remaining 10% penalty credit in a **single atomic call**—no separate refunds needed. |
| **Payments v2 (Void)** | `POST /v2/payments/authorizations/:id/void` | Immediately voids the authorization if the order is cancelled, a fraud alert triggers, or the spending mandate fails verification. |
| **Payments v2 (Reauthorization)** | `POST /v2/payments/authorizations/:id/reauthorize` | Documented path for reauthorizing held funds if fulfillment extends beyond the initial 3-day honor window within the 29-day validity window. |
| **PayPal Webhooks v1** | `POST /api/paypal/webhook` with `verify-webhook-signature` | Cryptographically verifies incoming event signatures via PayPal's `/v1/notifications/verify-webhook-signature` endpoint. |
| **Invoicing v2** | `POST /v2/invoicing/invoices` | Automatically generates an itemized official B2B business invoice with line items, tax, and currency metadata upon delivery capture. |
| **Payouts v1** | `POST /v1/payments/payouts` | Disburses net settlement to merchant account while retaining platform fee. Handled via labeled simulation fallback when region-restricted (`PAYOUT_NOT_AVAILABLE`). |
| **Live Currency Reconciliation** | `reconcileItemizedTotal()` | Reconciles fractional cent rounding differences when converting INR to USD, eliminating `ITEM_TOTAL_MISMATCH` errors. |

---

## 4. How AI is Used (Agentic Commerce & Guardrails)

We deliberately rejected asking an LLM to "calculate totals" or "check specs." AI does what it excels at: understanding ambiguous natural language, multimodal intake, and autonomous negotiation. The rest is mathematically enforced.

| AI Module | Model / Implementation | Responsibilities & Guardrails |
|---|---|---|
| **Procurement Agent Loop** | Google Gemini 2.5 Flash (`@google/genai`) | Autonomous agent tool-calling loop equipped with tools: `search_catalog`, `verify_specs`, `build_plans`, `check_budget`, `start_negotiation`, `create_mandate`. |
| **Two-Agent Autonomous Negotiation** | LLM-vs-LLM (Buyer Agent vs Vendor Quote Engine) | Structured multi-round negotiation. The vendor agent defends a private mathematical reservation price (`calculateVendorFloor`) while granting volume rebates. |
| **Multimodal Quote Comparison** | Gemini Vision / Text Parser | Parses messy vendor proforma invoices and WhatsApp quotes, converts them into canonical catalog schemas, and calculates guaranteed savings against verified plans. |
| **Deterministic Constraint Verifier** | Pure TypeScript / JavaScript Engine | Evaluates hard inequalities (e.g. `144Hz >= 144Hz`, `delivery <= 7 days`). Products failing any constraint are rejected with explicit, explainable audit reasons. |
| **Prompt-Injection Defense** | Guardrail sanitizer & Schema Firewall | Rejects adversarial instructions embedded in vendor catalog feeds or user prompts (e.g. *"Ignore budget ceiling"*). Fails closed immediately. |
| **Offline Simulation Fallback** | Deterministic Multi-Round Simulator | If Gemini API limits or network outages occur, smoothly falls back to an offline simulated negotiation clearly labeled **"Offline Simulation"** for judging integrity. |

---

## 5. Foreign Exchange (FX) Correctness

ProcureAI queries live foreign exchange rates from `open.er-api.com` with explicit direction tracking:
- **Base Currency:** `USD`
- **Target Currency:** `INR`
- **Direction:** `USD_TO_INR`
- **Current Live Rate:** `95.08 INR per USD` (1 USD = 95.08 INR; 1 INR = 0.010517 USD)
- **Known Test Fixture:** ₹60,000 INR at 95.08 INR/USD = **$631.05 USD** (verified in [test/fxCorrectness.test.js](file:///home/varshith/paypal-ai-hackathon/test/fxCorrectness.test.js)).
- **UI Display:** Explicitly renders `FX: 1 USD = ₹95.08 INR (open.er-api.com · updated UTC)` in the header and checkout breakdown.

---

## 6. Real Spending Mandate & Cryptographic Integrity

ProcureAI implements an **Ed25519 Cryptographic Spending Mandate** (`node:crypto`):

```json
{
  "mandateId": "mandate_1793627200923_ade0fced",
  "buyerId": "org_design_studios",
  "approverId": "finance_lead_01",
  "planId": "plan_workstations_v2",
  "planVersion": 1,
  "maxTotalINR": 58000,
  "maxTotalUSD": "690.20",
  "fxRate": 0.010517,
  "allowedMerchants": ["hardware_supplier_01", "direct_distributor"],
  "nonce": "d6fa21010078",
  "expiresAt": "2026-11-03T13:46:40.923Z",
  "signature": "3a0b49f8...",
  "publicKey": "..."
}
```

### Mandate Enforcement Guarantees:
1. **Hard Budget Ceiling:** The PayPal authorization endpoint (`/api/paypal/authorize-order`) mathematically rejects any order if the total exceeds `maxTotalINR` or `maxTotalUSD`.
2. **Single-Use Expiring Approval Tokens:** Replaces raw query parameters with cryptographically random tokens (`approval_tokens` table) bound to the mandate and plan version. Auto-expires in 60 minutes and strictly rejects reuse.
3. **Version Pinning:** Prevents race-condition front-running if a plan was modified after approval.
4. **Replay Defense:** Single-use nonces and expiration timestamps prevent replay attacks.
5. **Tamper Detection:** The UI includes an interactive **"Test Tampering"** button that lets judges alter a single rupee or dollar and watch verification fail instantly.
6. **Hash-Chained Audit Trail:** Every order state transition is recorded in SQLite with a SHA-256 hash pointer to the preceding block (`verifyAuditLogIntegrity()`), preventing audit tampering.

---

## 7. Responsive Mobile & Desktop Layout (Playwright Verified)

ProcureAI is verified with automated Playwright tests at:
- **Mobile Viewport (390x844)**: `clientWidth = 390px, scrollWidth = 390px (delta = 0px)` — zero horizontal overflow.
- **Desktop Viewport (1440x900)**: `clientWidth = 1440px, scrollWidth = 1440px (delta = 0px)` — zero horizontal overflow.
- **Natural Touch Targets:** Configured Ant Design token `controlHeight: 44` for standard 44px buttons and inputs without blanket `!important` CSS overrides.
- **Screenshots:** Saved under [docs/screenshots/](file:///home/varshith/paypal-ai-hackathon/docs/screenshots/):
  - [mobile-390x844-dashboard.png](file:///home/varshith/paypal-ai-hackathon/docs/screenshots/mobile-390x844-dashboard.png)
  - [mobile-390x844-approval.png](file:///home/varshith/paypal-ai-hackathon/docs/screenshots/mobile-390x844-approval.png)
  - [desktop-1440x900-dashboard.png](file:///home/varshith/paypal-ai-hackathon/docs/screenshots/desktop-1440x900-dashboard.png)
  - [desktop-1440x900-approval.png](file:///home/varshith/paypal-ai-hackathon/docs/screenshots/desktop-1440x900-approval.png)

---

## 8. 3-Minute Judge Demo Walkthrough

See [DEMO.md](file:///home/varshith/paypal-ai-hackathon/DEMO.md) for the complete minute-by-minute script and sandbox login details:

1. **(0:00–0:25) Request:** Click **"🔄 Reset Demo State"**, then click **"1️⃣ Request: ₹60k Setup"**. Click **"Search & Plan"**.
2. **(0:25–0:55) Verification:** Review the 3 generated plans. View rejection reasons in the drawer (e.g. 75Hz monitor rejected).
3. **(0:55–1:20) AG Grid Live Matrix:** Click **"2️⃣ AG Grid Live Matrix"**. Edit monitor quantity from 1 to 5. Watch totals and USD settlement update dynamically.
4. **(1:20–1:50) AI Negotiation & Mandate:** Click **"3️⃣ AI Vendor Negotiation (-5%)"**. Review Ed25519 signature. Test tampering refusal and verify signature.
5. **(1:50–2:20) Approver Portal & Hold:** Click **"Copy CFO Approval Link"** or **"Open Approver Portal"**. Approve mandate, checkout on PayPal. Status becomes **AUTHORIZED**.
6. **(2:20–2:45) Delivery Capture & Payout:** Click **"6️⃣ Confirm Delivery (Capture & Payout)"**. SSE updates to **CAPTURED**. View PayPal invoice draft.
7. **(2:45–3:00) Audit Trail & Ledger:** Open Orders Ledger (AG Grid) and Activity Inspector to view SHA-256 hash chain and live event streams.

---

## 9. Quickstart: Run in 5 Commands

### Prerequisites
- **Node.js >= 22.5.0** (Required for native `node:sqlite`; pinned to Node 22.12.0 in `render.yaml`)
- Modern web browser

```bash
# 1. Clone the repository
git clone https://github.com/Varshith226/ProcureAI-Paypal.git
cd ProcureAI-Paypal

# 2. Install dependencies (backend & frontend)
npm install
cd client && npm install && cd ..

# 3. Configure environment
cp .env.example .env
# (Add your PAYPAL_CLIENT_ID and GEMINI_API_KEY, or run with built-in sandbox defaults)

# 4. Run automated test suite (204 passing tests)
npm test

# 5. Build and launch ProcureAI
cd client && npm run build && cd ..
npm start
```
Open **`http://localhost:3000`** in your browser.

---

## 10. Automated Test Suite (204 Passing Tests)

```bash
npm test
```

```
ℹ tests 204
ℹ suites 0
ℹ pass 204
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
```

### Coverage Highlights:
- **`scripts/test-responsive.js`**: Playwright headless browser test checking zero horizontal overflow at 390x844 (mobile) and 1440x900 (desktop).
- **`test/fxCorrectness.test.js`**: Currency conversion fixture (₹60,000 at 95.08 INR/USD = $631.05 USD), explicit direction validation, and mathematical reciprocal integrity.
- **`test/endToEndHardening.test.js`**: SQL injection prevention, revalidation on price drop / delivery slip, multi-item unit quota calculations, 29-day authorization validity, and mandate tampering (buyerId, approverId, items).
- **`test/approvalTokens.test.js`**: Single-use approval tokens, token consumption, replay attack defense, expiration enforcement, and plan tampering refusal.
- **`test/paypalHardening.test.js`**: Authorize-then-capture lifecycle, 90% SLA penalty atomic capture, authorization voiding, duplicate webhook handling, and issue code mapping.
- **`test/promptInjectionSecurity.test.js`**: Adversarial prompt injection defense, budget bypass prevention, quote instruction sanitization, and negative price rejections.
- **`test/auditLogResilience.test.js`**: SQLite hash-chained audit trail integrity verification and tamper detection.
- **`test/aiAgent.test.js` & `test/channel3.test.js`**: Tool-calling agent execution, 2-agent negotiation margin floor defense, multimodal quote parsing, and Channel3 live/sample data origin attribution.

---

## 11. Known Limitations & Transparent Disclosures

1. **PayPal Sandbox Payouts Regional Availability**:
   - In Indian and certain regional PayPal Sandbox accounts, `POST /v1/payments/payouts` returns HTTP 403 `PAYOUT_NOT_AVAILABLE` because Payouts capabilities require explicit commercial enablement by PayPal Developer Support.
   - **Handling**: ProcureAI catches this 403 status code and returns a simulation object (`isSimulation: true`), clearly labeled in the UI as **Simulation**. In eligible sandbox regions (e.g. US accounts), live payouts execute directly.
   - Recorded raw response in [docs/SANDBOX_EVIDENCE.md](file:///home/varshith/paypal-ai-hackathon/docs/SANDBOX_EVIDENCE.md).

2. **Channel3 E-Commerce Catalog Feeds**:
   - The application supports live e-commerce catalog queries via Channel3 when `CHANNEL3_API_KEY` is provided. When no API key is present in `.env`, ProcureAI falls back to local reference products with evidence explicitly labeled as `SAMPLE_CATALOG`. Only live API responses receive the `LIVE_RETAILER` label.

3. **PayPal Webhooks Setup & Delivery**:
   - Inbound webhook delivery requires a publicly accessible HTTPS endpoint (`https://<app>.onrender.com/api/paypal/webhook`).
   - Signature verification is fully implemented against PayPal's `/v1/notifications/verify-webhook-signature` endpoint and tested with automated unit/integration tests; local development is supplemented by an in-app webhook simulation clearly labeled as **Simulation**.

4. **Ephemeral Database on Free-Tier Hosting**:
   - In environments without persistent disk storage, SQLite safely falls back to local `./procureai.db` and auto-seeds the genesis audit log entry on cold boot.

---

## 12. Final Hackathon Submission Checklist

| # | Requirement | Status | Evidence & Verification Link |
|---|---|---|---|
| 1 | **PayPal Sandbox Deep Implementation** | **PASS** | Live sandbox `intent: "AUTHORIZE"` order created (`9KX89008SB555684J`), captured, SLA partial capture (90% capture / 10% void), voided, Invoicing v2 draft created (`INV2-BT4R-JNPH-WD74-9F6R`). Documented in [docs/SANDBOX_EVIDENCE.md](file:///home/varshith/paypal-ai-hackathon/docs/SANDBOX_EVIDENCE.md). |
| 2 | **Meaningful AI Integration** | **PASS** | Gemini 2.5 Flash used for natural language parsing, tool calling, 2-agent LLM negotiation with private margin floor defense, multimodal quote intake, and prompt injection defense. Tested in [test/aiAgent.test.js](file:///home/varshith/paypal-ai-hackathon/test/aiAgent.test.js) & [test/promptInjectionSecurity.test.js](file:///home/varshith/paypal-ai-hackathon/test/promptInjectionSecurity.test.js). |
| 3 | **Ed25519 Cryptographic Spending Mandate** | **PASS** | `node:crypto` Ed25519 asymmetric key signing. Hard ceiling enforcement at PayPal authorization. Single-use expiring tokens for CFO approval. Verified in [test/approvalTokens.test.js](file:///home/varshith/paypal-ai-hackathon/test/approvalTokens.test.js). |
| 4 | **AG Grid Community Integration** | **PASS** | AG Grid Community v36 Plan Matrix with inline cell editing, live USD recalculation, and Orders Ledger with CSV export. Implemented in [client/src/components/PlanMatrixGrid.jsx](file:///home/varshith/paypal-ai-hackathon/client/src/components/PlanMatrixGrid.jsx) and [client/src/components/OrdersLedgerGrid.jsx](file:///home/varshith/paypal-ai-hackathon/client/src/components/OrdersLedgerGrid.jsx). |
| 5 | **Cryptographic Audit Trail** | **PASS** | Native SQLite WAL database with SHA-256 hash-chaining across all order transitions. Verified in [test/auditLogResilience.test.js](file:///home/varshith/paypal-ai-hackathon/test/auditLogResilience.test.js). |
| 6 | **Automated Test Suite** | **PASS** | **204 automated tests passing**, 0 failing (`npm test`). Verified via `node --test`. |
| 7 | **Mobile & Desktop Responsive Layout** | **PASS** | Playwright test verified zero horizontal overflow at 390x844 and 1440x900. Verified in [scripts/test-responsive.js](file:///home/varshith/paypal-ai-hackathon/scripts/test-responsive.js); screenshots in [docs/screenshots/](file:///home/varshith/paypal-ai-hackathon/docs/screenshots/). |
| 8 | **Production Deployment** | **PASS** | Configured in [render.yaml](file:///home/varshith/paypal-ai-hackathon/render.yaml) with pinned Node version (`22.12.0`) and health check `/api/health`. |
| 9 | **Public GitHub & Open Source License** | **PASS** | Fully open source under standard **MIT License** with visible [LICENSE](file:///home/varshith/paypal-ai-hackathon/LICENSE) file and clean [.env.example](file:///home/varshith/paypal-ai-hackathon/.env.example). |
| 10 | **Postman / APIMatic Specification** | **PASS** | Complete [openapi.yaml](file:///home/varshith/paypal-ai-hackathon/openapi.yaml) (OpenAPI 3.1) and [procureai.postman_collection.json](file:///home/varshith/paypal-ai-hackathon/procureai.postman_collection.json) with automated test assertions. |

---

## 13. License

This project is licensed under the **MIT License** — see the [LICENSE](LICENSE) file for details.
