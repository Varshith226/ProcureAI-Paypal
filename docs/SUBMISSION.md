# Hackathon Submission: ProcureAI

**Competition:** Build What's Next with PayPal and AI  
**Track / Category:** Grand Prize, Best Use of PayPal + AI, Best Use of Agentic Commerce, Best Use of AG Grid, Best Use of Render, Best Use of Channel3, Best Use of Postman/APIMatic  
**Project Title:** ProcureAI — Autonomous AI Procurement Agent with PayPal Pay-on-Delivery Authorization Holds & Cryptographic Mandates  
**Elevator Pitch:** An autonomous AI procurement agent that purchases hardware on your behalf under an Ed25519 cryptographic spending mandate, with PayPal holding the funds in a pay-on-delivery authorization hold until delivery is physically verified.

---

## 1. Inspiration & The Real-World Problem
Small businesses, startups, schools, and agencies in India waste dozens of hours every month equipping offices. They communicate with local hardware vendors over WhatsApp, receive PDF proforma invoices with arbitrary markups, and are forced to pay 100% upfront via bank transfers.

When shipments arrive late or contain downgraded specifications (e.g. 75Hz monitors instead of the requested 144Hz displays), the buyer has zero leverage or recourse. The money is already gone. 

Existing corporate procurement software (SAP, Coupa) is built for Fortune 500 enterprises with six-figure budgets. Small businesses need an autonomous agent that can source hardware, verify technical constraints without hallucinating, negotiate discounts, enforce strict spending ceilings, and hold payment in an authorization hold until boxes are opened and inspected.

---

## 2. What ProcureAI Does
ProcureAI transforms messy procurement into a secure, 6-stage autonomous workflow:

1. **Natural Language Intake:** The office manager enters a plain-English request (e.g., *"Set up 5 workstations, budget ₹3,00,000, 144Hz monitors, deliver in 7 days"*). Gemini parses the requirements into structured constraints.
2. **Deterministic Constraint Verification:** Rather than letting an LLM do fuzzy math, our deterministic engine evaluates catalog specs against hard constraints, generating 3 verified plans (Minimum Cost, Best Value, Fastest Delivery) with complete rejection transparency for unqualified products.
3. **AG Grid Community Live Matrix:** Users review and customize line items in an AG Grid data grid. Quantity edits instantly update totals, tax line items, and live USD settlement conversions with zero rounding errors.
4. **Two-Agent Autonomous Negotiation:** A Buyer LLM engages the Vendor's Quote Engine in multi-round structured negotiation. The vendor agent defends a private mathematical margin floor while conceding volume discounts, saving real funds.
5. **Ed25519 Cryptographic Spending Mandate:** The negotiated order is signed cryptographically (`node:crypto` Ed25519). The mandate locks the ceiling amount, allowed merchant, item hash, and nonce. If an attacker attempts to tamper with the price or merchant, authorization fails closed.
6. **Single-Use Expiring Approval Tokens:** Remote CFOs receive a single-use, time-limited token link bound to the mandate and plan version for remote authorization.
7. **PayPal Pay-on-Delivery Authorization Hold:** Payment is initialized with `intent: "AUTHORIZE"`. Funds are held in an authorization hold on PayPal's platform for 29 days. Upon physical delivery inspection:
   - **On On-Time Delivery:** The buyer clicks "Confirm Delivery". PayPal captures the authorization, triggers a vendor payout (or labeled simulation if sandbox region restricted), and issues an itemized **PayPal Invoice v2**.
   - **On SLA Slippage:** Our engine triggers an atomic partial capture (`amount: 90%`, `final_capture: true`), automatically releasing the 10% penalty credit back to the buyer in a single transaction.

---

## 3. How We Built It

### Architecture Overview
```
[User / Natural Language / WhatsApp Quote]
           │
           ▼
[Gemini 2.5 Flash] ──(Structured Tools)──► [Deterministic Verifier & Optimizer]
                                                    │
                                                    ▼
[Two-Agent LLM Negotiation] ──────────────► [Ed25519 Signed Mandate & Approval Token]
(Buyer Agent vs Vendor Floor Policy)                │
                                                    ▼
[AG Grid Community Data Matrix] ──────────► [PayPal Orders v2 (intent: AUTHORIZE)]
                                                    │ (Authorization Hold up to 29 Days)
                                                    ▼
[Delivery Inspection / SLA Breach] ───────► [PayPal Payments v2 (Capture / Void)]
                                                    │
                                 ┌──────────────────┴──────────────────┐
                                 ▼                                     ▼
                     [PayPal Invoicing v2]                  [PayPal Payouts v1]
```

### Core Technologies Used:
- **PayPal Platform (Full Sandbox Lifecycle):**
  - **Orders v2 (`intent: "AUTHORIZE"`):** Holds buyer funds in an authorization hold without instant capture.
  - **Payments v2 (`/v2/payments/authorizations/:id/capture`):** Atomic capture upon verified delivery, with support for partial capture and `final_capture: true` for automatic SLA penalty credits.
  - **Payments v2 (`/v2/payments/authorizations/:id/void`):** Immediate release of held funds on order cancellation or fraud prevention.
  - **Payments v2 (`/v2/payments/authorizations/:id/reauthorize`):** Formal reauthorization support within the 29-day validity window.
  - **Webhooks v1:** Verified via `POST /v1/notifications/verify-webhook-signature` with in-app simulation fallback.
  - **Invoicing v2 (`/v2/invoicing/invoices`):** Generation of formal itemized business tax invoices upon settlement.
  - **Payouts v1 (`/v1/payments/payouts`):** Multi-party merchant disbursement with graceful simulation fallback when region-restricted (`PAYOUT_NOT_AVAILABLE`).
  - **Live FX & Cent-Accurate Reconciliation:** Dual INR/USD accounting preventing `ITEM_TOTAL_MISMATCH` errors.
- **AI & Agentic Commerce:**
  - **Google Gemini 2.5 Flash (`@google/genai`):** Natural language parsing, conversational clarification, and multimodal WhatsApp quote intake.
  - **Two-Agent Negotiation Protocol:** Buyer agent vs Vendor agent with private margin floor logic (`calculateVendorFloor`).
  - **Tool-Calling Agent Loop:** Tool registry with deterministic execution (`search_catalog`, `verify_specs`, `build_plans`, `check_budget`, `start_negotiation`, `create_mandate`).
  - **Prompt Injection Defense:** Strict fail-closed boundary preventing prompt overrides from modifying budget ceilings or skipping verifications.
- **Data & Persistence:**
  - **Node.js Native SQLite (`node:sqlite`):** Embedded ACID database with WAL mode and `busy_timeout` handling.
  - **Cryptographic Audit Log:** SHA-256 hash-chaining audit trail where every state change commits to the previous record hash (`verifyAuditLogIntegrity`).
  - **Server-Sent Events (SSE):** Real-time event streaming (`/api/events`) pushing live order updates, webhook dispatches, and negotiation progress.
- **Frontend & UX:**
  - **AG Grid Community v36:** High-performance editable grid with pinned bottom totals and currency synchronization.
  - **React 18 & Vite:** Fast frontend build with Ant Design 5.x and Framer Motion.
  - **PayPal React SDK (`@paypal/react-paypal-js`):** Official PayPal smart buttons hooked directly into the authorize-then-capture lifecycle.
- **Sponsor Integrations:**
  - **Channel3:** Live e-commerce product search provider with transparent `SAMPLE_CATALOG` source attribution.
  - **Render:** Production deployment with persistent disk mounting and health check (`render.yaml`).
  - **OpenAPI 3.1 & Postman:** Production-grade `openapi.yaml` and `procureai.postman_collection.json` with comprehensive automated test scripts.

---

## 4. Challenges We Overcame
1. **Preventing PayPal `ITEM_TOTAL_MISMATCH` Across Currencies:** When multiplying item quantities with fractional foreign exchange rates, standard rounding introduces 1-2 cent discrepancies between line-item totals and order totals. We built `reconcileItemizedTotal` to deterministically reconcile the difference onto the highest-value line item, ensuring 100% acceptance across all PayPal API calls.
2. **Deterministic Verification vs LLM Math:** Large Language Models are notoriously unreliable at arithmetic and strict inequalities (e.g. `144Hz >= 144Hz`). We architected ProcureAI with a clear separation of concerns: Gemini handles linguistic extraction, while our deterministic TypeScript/JavaScript engine performs all constraint checking and scoring.
3. **Pay-on-Delivery SLA Penalty in a Single Transaction:** Traditional systems capture 100% and then issue a partial refund, incurring double processing fees and friction. We utilized PayPal's `final_capture: true` parameter on authorization capture, allowing ProcureAI to capture 90% and automatically void the remaining 10% penalty credit in a single atomic API call.

---

## 5. Accomplishments We're Proud Of
- **204 Passing Automated Tests:** Full test suite verifying order lifecycles, Ed25519 signature enforcement, single-use approval tokens, webhook idempotency, negotiation margin defenses, and prompt injection safety.
- **Real Agentic Governance:** The Ed25519 cryptographic spending mandate provides mathematical assurance that an AI agent cannot exceed human-approved budgets or alter merchant destinations.
- **Responsive Layout Verification:** Verified via Playwright at 390x844 (mobile) and 1440x900 (desktop) with 0px horizontal overflow and natural 44px touch targets.
- **End-to-End Working Product:** Not a mockup—every button from natural language search to PayPal Sandbox authorization, delivery confirmation, AG Grid editing, and webhook streaming works end-to-end.

---

## 6. What We Learned
- How to properly structure authorize-then-capture workflows in PayPal Orders v2 for B2B pay-on-delivery scenarios.
- The power of combining deterministic constraint solvers with modern generative AI reasoning.
- How to architect robust Server-Sent Event pipelines and cryptographic hash-chained audit trails in native Node.js without heavy external dependencies.

---

## 7. What's Next for ProcureAI
- **WhatsApp Integration:** Integrating a WhatsApp Business bot so Indian office managers can approve purchases and review mandates directly from chat.
- **Cross-Border Trade:** Expanding the FX engine to support multi-currency pay-on-delivery holds across Southeast Asia (SGD, MYR, IDR) and the US.
- **Logistics Courier Webhooks:** Integrating Shiprocket / BlueDart API webhooks to automatically trigger delivery confirmation and payout release upon signed digital proof-of-delivery (POD).
