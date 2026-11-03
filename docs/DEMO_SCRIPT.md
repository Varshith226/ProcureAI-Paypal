# ProcureAI: 3-Minute Hackathon Video Demo Script
**Competition:** Build What's Next with PayPal and AI  
**Time Limit:** Under 3 minutes (180 seconds)  
**Presenter:** Single or dual voiceover (clear, confident, fintech-focused)

---

## Story Architecture at a Glance
- **Tagline:** "ProcureAI: an AI procurement agent that buys on your behalf, with a spending limit it cannot exceed, and PayPal holds the money until the goods actually arrive."
- **Target Persona:** Priya, Operations Lead at a fast-growing 25-person tech startup in Bengaluru, India. She is tasked with equipping new workstations under a strict budget, needs co-founder sign-off, and currently risks overpaying upfront vendors with zero recourse.

---

## Minute-by-Minute Breakdown

```
[0:00 - 0:25] THE PROBLEM & AGENT INTAKE
[0:25 - 0:55] DETERMINISTIC VERIFIER & PLAN SELECTION
[0:55 - 1:25] AG GRID INTERACTIVE MATRIX & CURRENCY SETTLEMENT
[1:25 - 1:55] 2-AGENT NEGOTIATION & ED25519 SPENDING MANDATE
[1:55 - 2:25] APPROVER PORTAL & PAYPAL AUTHORIZE (ESCROW HOLD)
[2:25 - 2:45] DELIVERY INSPECTION, CAPTURE, SLA CREDIT & PAYOUTS
[2:45 - 3:00] SPONSOR TECH STACK & PRODUCTION ON RENDER
```

---

### [0:00 - 0:25] 1. The Problem & Natural Language Intake
* **Visual:** Browser opens on ProcureAI command center (clean dark theme, status indicators live).
* **Action:** Click "1️⃣ Request: ₹60k Setup" demo preset button (or paste prompt). Prompt box populates:  
  `"Set up 5 workstations, budget ₹3,00,000, deliver in 7 days, 144Hz monitors, mechanical keyboards."`
* **Voiceover:**  
  > *"When Indian startups buy hardware, operations leads like Priya spend days comparing messy WhatsApp quotes and sending money upfront with zero recourse. If the vendor sends 75Hz monitors or ships two weeks late, your money is already gone.*  
  > *This is ProcureAI: an autonomous procurement agent that finds verified equipment, negotiates discounts, signs a tamper-proof spending mandate, and uses PayPal Authorize-then-Capture to hold funds until delivery is verified."*

---

### [0:25 - 0:55] 2. Deterministic Verification & Transparency
* **Visual:** Click **"Search & Plan"**. Loading pulse appears, followed by 3 strategy cards.
* **Action:** Hover over the Rejection Details in the Plan Summary card.
* **Voiceover:**  
  > *"Gemini 2.5 Flash parses the unstructured intent into strict category constraints. But here is our fundamental design choice: AI never does math. Instead, our deterministic constraint engine evaluates every product spec.*  
  > *Notice the transparency: our engine generates 3 real plans—Minimum Cost, Best Value, and Fastest Delivery—and shows exactly why other products were rejected, such as a 75Hz monitor failing the 144Hz threshold. No hallucinations, no math errors."*

---

### [0:55 - 1:25] 3. AG Grid Live Matrix & Currency Settlement
* **Visual:** Switch view to the **Plan Matrix (AG Grid)**.
* **Action:** Double click the "Quantity" cell for the monitor row and change it from 1 to 5. Notice the pinned summary row updates live.
* **Voiceover:**  
  > *"Judges, here is our deep integration with AG Grid Community. Operations leads can review every line item in an enterprise data grid. As I update quantities inline, the pinned bottom totals row recalculates instantly.*  
  > *At the same time, our currency reconciliation engine syncs Indian Rupees to US Dollars using live cached FX rates, preventing PayPal cent-rounding mismatches."*

---

### [1:25 - 1:55] 4. Two-Agent LLM Negotiation & Ed25519 Mandate
* **Visual:** Click **"3️⃣ AI Vendor Negotiation (-5%)"** button to open the Negotiation Drawer.
* **Action:** Show the multi-round chat between Buyer Agent and Vendor Agent. Click **"Test Tampering"** then **"Verify Signature"**.
* **Voiceover:**  
  > *"Next: real agentic commerce. Watch our Buyer Agent negotiate with the Vendor's Quote Engine. This isn't scripted theater—both agents run through structured LLM rounds. The vendor agent defends its private margin floor while granting a bulk discount, saving the company ₹2,338.*  
  > *The final agreement is bound into an Ed25519-signed Cryptographic Spending Mandate. If an attacker tampers with the price or merchant, verification fails immediately. The agent cannot overspend."*

---

### [1:55 - 2:25] 5. Executive Approver Portal & PayPal Authorize (Escrow Hold)
* **Visual:** Click **"Open Approver Portal"** (or open the copied URL in a private window). Click **"Approve & Release Mandate"**, then click the **PayPal Checkout Button**.
* **Action:** Log into PayPal Sandbox buyer account. Complete approval. Notice order status updates live to `AUTHORIZED`.
* **Voiceover:**  
  > *"Before money moves, governance is enforced. Priya shares an executive approval link with her co-founder. The approver verifies the Ed25519 signature and approves.*  
  > *Now Priya clicks PayPal. Notice our integration depth: the intent is AUTHORIZE, not CAPTURE. Funds are held in escrow on PayPal's platform for 29 days. The vendor knows the funds are guaranteed, but cannot touch them yet."*

---

### [2:25 - 2:45] 6. Delivery Confirmation, Capture, SLA Credit & Payouts
* **Visual:** Click **"6️⃣ Confirm Delivery"** (or "Simulate Webhook Delivery").
* **Action:** Real-time Server-Sent Events push `ORDER_CAPTURED`. Show the generated **PayPal Invoice v2** link and **Vendor Payout** status.
* **Voiceover:**  
  > *"The courier arrives at the office. Priya inspects the hardware and clicks 'Confirm Delivery'.*  
  > *Instantly, PayPal captures the authorized amount, triggers an automated vendor payout via PayPal Payouts API minus a 1.5% platform fee, and issues a formal PayPal Invoice.*  
  > *If delivery had slipped past the SLA deadline, our engine automatically triggers a partial capture with `final_capture: true`, keeping the 10% SLA penalty in Priya's account."*

---

### [2:45 - 3:00] 7. Architecture, Sponsor Tools & Production
* **Visual:** Pan across the Activity Inspector (live SSE stream), Orders Ledger, and live hosted URL on Render.
* **Voiceover:**  
  > *"ProcureAI is production-ready: built with Node.js, SQLite hash-chained audit logging, AG Grid v36, Channel3 live catalog fallback, and Google Gemini 2.5 Flash, running live on Render with persistent disk storage.*  
  > *ProcureAI turns high-risk procurement chaos into autonomous, verified, escrow-backed commerce. Thank you."*

---

## Recording Checklist
1. **Audio:** High-quality microphone, no copyrighted music, clear volume.
2. **Video:** 1080p or 4K resolution, 60fps, clean browser window (F11 fullscreen, no personal bookmarks).
3. **Pacing:** Strict adherence to timestamps. Total duration: **2 minutes 54 seconds**.
4. **Links in Description:**
   - GitHub Repository URL (public with MIT License)
   - Live Render Demo URL
   - Devpost Project Submission Link

