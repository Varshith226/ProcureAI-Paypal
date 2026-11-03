# ProcureAI: 3-Minute Demo Guide & Presentation Script

This guide provides the exact click path, sandbox credentials, and expected outputs for presenting ProcureAI during judging and video recording.

---

## 1. Sandbox Test Credentials

To test the real PayPal checkout approval in sandbox:
- **Sandbox Login Portal:** [https://www.sandbox.paypal.com](https://www.sandbox.paypal.com)
- **Buyer Test Account:**
  - **Email:** `sb-buyer@personal.example.com` (or create your own personal sandbox account at [developer.paypal.com](https://developer.paypal.com/dashboard/accounts))
  - **Password:** Available in your PayPal Developer Dashboard under *Testing Tools > Sandbox Accounts*.
- **Merchant Account:** Default pre-configured sandbox business account associated with `PAYPAL_CLIENT_ID`.

---

## 2. Pre-Demo Setup & Clean State Reset

Before recording or presenting, ensure a clean state:
1. Open the application: **`http://localhost:3000`** (or your live Render URL).
2. Click the red **"🔄 Reset Demo State"** button in the top Judge Demo Bar.
   - *Backend endpoint:* `POST /api/demo/reset`
   - *Action:* Clears previous demo orders and approval tokens in SQLite, appends a `DEMO_RESET` audit block, and resets active UI states.

---

## 3. The 3-Minute Exact Demo Flow

| Timestamp | Phase & Action | Where to Click in UI | Expected Screen Result | Narration Talking Points |
|---|---|---|---|---|
| **0:00 – 0:25** | **Problem & Natural Language Intake** | Click **"1️⃣ Request: ₹60k Setup"** preset in top demo bar, then click **"Search & Plan"**. | Input populates with: *"Set up 5 workstations for our design studio under ₹3 lakh in 7 days with 144Hz monitors, mechanical keyboards, ergonomic mice and headsets."* Status changes to *Planning*. | "Indian startups and small businesses waste dozens of hours buying equipment over WhatsApp, paying 100% upfront with zero recourse. ProcureAI turns natural language into a verified, escrow-backed commerce lifecycle." |
| **0:25 – 0:50** | **Deterministic Verification & Transparency** | View the 3 generated plans: *Minimum Cost, Best Value, Fastest Delivery*. Click "Why were other items rejected?". | Plan cards render with exact totals, delivery dates, and spec matches. Rejection drawer lists products that failed (e.g. 75Hz monitor rejected because `75Hz < 144Hz`). | "Unlike traditional AI that does fuzzy math, ProcureAI uses Google Gemini for language understanding, but all constraint verification is 100% deterministic. Judges can see every rejected product and why." |
| **0:50 – 1:20** | **AG Grid Community Live Matrix** | Click **"2️⃣ AG Grid Live Matrix"** (or switch to Matrix tab). Double-click a quantity cell and change from `1` to `5`. | AG Grid editable matrix updates totals dynamically. Dual-currency bar updates live USD settlement with zero cent drift (`reconcileItemizedTotal`). | "ProcureAI embeds an AG Grid Community data matrix. Line items, quantities, and dual INR/USD pricing recalculate in real-time, eliminating PayPal's ITEM_TOTAL_MISMATCH rounding errors." |
| **1:20 – 1:50** | **Two-Agent Negotiation & Signed Mandate** | Click **"3️⃣ AI Vendor Negotiation (-5%)"**. Watch the negotiation modal, then click **"Verify Signature"**. | Multi-round LLM negotiation stream: Buyer Agent negotiates against Vendor Floor Engine. ₹2,999 discount applied. Ed25519 mandate shows cryptographic signature. Tampering demo proves fraud rejection. | "Our Buyer agent negotiates bulk discounts with the vendor's quote engine while respecting private margin floors. The agreement is locked in an Ed25519 Cryptographic Spending Mandate that cannot be altered." |
| **1:50 – 2:20** | **Executive Approval & PayPal Authorization** | Click **"Copy CFO Approval Link"** or **"Open Approver Portal"**. Approve mandate, then click PayPal Sandbox button. | Single-use 60-minute approval token validates. PayPal checkout modal opens with `intent: "AUTHORIZE"`. Status becomes **AUTHORIZED (Funds Held)**. | "Remote CFOs sign off using single-use expiring approval tokens. On PayPal checkout, funds are held in a 29-day authorization hold rather than captured immediately. The vendor gets paid only after delivery." |
| **2:20 – 2:45** | **Delivery Inspection, Capture & Invoicing** | Click **"6️⃣ Confirm Delivery (Capture & Payout)"**. | Server-Sent Events (SSE) updates order status in real-time to **CAPTURED**. Itemized **PayPal Invoice v2** link appears, and vendor payout confirmation is recorded. | "When goods arrive and pass physical inspection, the buyer confirms delivery. PayPal atomically captures the hold, generates an itemized B2B tax invoice, and triggers vendor payout." |
| **2:45 – 3:00** | **Cryptographic Audit Trail & Closing** | Open **"Orders Ledger (AG Grid)"** in header, then open **Activity Inspector** tab. | AG Grid displays all past orders with status chips and CSV export. SQLite SHA-256 hash-chain audit log shows `VALID` cryptographic integrity. | "Every state transition is committed to an immutable SHA-256 hash chain in SQLite. ProcureAI combines Gemini AI reasoning, AG Grid data agility, and PayPal authorization holds for trustworthy agentic commerce." |

---

## 4. Demonstrating Edge Cases

### Edge Case A: Retailer Price Spike Safety Lock
1. After generating plans, click **"5️⃣ Price Spike Protection"** in the demo bar.
2. The revalidation engine queries the catalog, detects a price increase that breaches budget or mandate limits, and sets status to **INVALID**.
3. Checkout button is disabled with explanation: *"Price changed past approved mandate ceiling"*.

### Edge Case B: SLA Delivery Slippage Partial Capture (90% Capture / 10% Void)
1. On an authorized order, open the delivery confirmation dropdown.
2. Select **"Late Delivery (10% SLA Penalty Credit)"**.
3. ProcureAI calls PayPal's capture endpoint with `final_capture: true` and 90% of the authorized amount.
4. 90% is captured atomically, and the 10% penalty credit is voided and returned to the buyer in a single transaction without separate refunds.

---

## 5. Live Architecture & Endpoints Summary

- **Frontend:** React 18, Vite, AG Grid Community v36, Ant Design 5.x
- **Backend:** Node.js (>= 22.5.0), Express, native `node:sqlite` WAL engine
- **Live Foreign Exchange:** `GET /api/fx-rate` (`open.er-api.com` live rates with explicit INR per USD direction)
- **Cryptographic Audit Trail:** `GET /api/audit-log` (tamper-evident SHA-256 hash chain)
- **Real-Time Streaming:** `GET /api/events` (Server-Sent Events)
- **Demo State Reset:** `POST /api/demo/reset` (clean state initialization)

