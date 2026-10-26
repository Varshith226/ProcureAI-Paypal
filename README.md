# ProcureAI

**ProcureAI turns a natural-language purchasing request into a complete, budget-aware, constraint-checked basket with explainable recommendations, before the user authorizes payment through PayPal.**

> "I need a complete setup for coding and gaming under ₹60,000. I already own a laptop. I need a 144 Hz monitor, keyboard, mouse and headphones…"
>
> → three complete baskets (Cheapest ₹12,292 · Best Value ₹54,996 · Alternative ₹50,296), every hard constraint checked, every rejected product explained, then user approval → PayPal sandbox checkout.

Built for the [PayPal AI Hackathon](https://paypalaihackathon.devpost.com/).

## How it works

```
User request ─► Request agent ─► Catalog ─► Verification ─► Basket optimizer ─► Plans ─► User approves ─► Re-check ─► PayPal sandbox checkout
                (natural language   (demo      (PASS / FAIL /   (exact, budget-     (3 strategies   (locks the     (VALID /    (order created only
                 → request JSON)    catalog)    UNKNOWN)        aware search)       + reasons)      chosen plan)   CHANGED /    for a VALID plan)
                                                                                                                  INVALID)
```

| Part | What it does | Where |
|---|---|---|
| Request intelligence | Turns the user's sentence into the request JSON and asks clarifying questions | `src/aiService.js` *(in progress)* |
| Catalog, verification & optimizer | Checks every product against hard constraints, then finds the best complete baskets within budget, with reasons, and re-checks them before payment | `src/`, see [docs/procurement-engine.md](docs/procurement-engine.md) |
| Frontend & PayPal | Compares plans, takes approval, runs PayPal sandbox checkout | `client/`, `server.js` *(`role-frontend` branch)* |

Team integration guide: **[docs/INTEGRATION.md](docs/INTEGRATION.md)**. Shared JSON contract: [shared/contracts.json](shared/contracts.json).

## Run it

Requires **Node.js 20+**.

```bash
git clone https://github.com/Varshith226/ProcureAI-Paypal.git
cd ProcureAI-Paypal
npm install
cp .env.example .env          # then add your own PayPal sandbox credentials
npm test                      # automated tests
npm run demo                  # ₹60,000 example → 3 plans + rejected products (no server needed)
npm run demo:revalidate       # pre-checkout safety check: VALID / CHANGED / INVALID
npm start                     # API at http://localhost:3000
```

Try the API:

```bash
curl -X POST http://localhost:3000/api/procurement/plan \
  -H "Content-Type: application/json" \
  --data @examples/request-60k-setup.json
```

PayPal credentials go in `.env` only (git ignores it): `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_BASE_URL=https://api-m.sandbox.paypal.com`. Check them with `GET /api/paypal/test-connection`.

## API

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/procurement/plan` | Request JSON → `DRAFT` plan with `CHEAPEST` / `BEST_VALUE` / `ALTERNATIVE`, or `INFEASIBLE` with reasons |
| GET | `/api/procurement/plans/:planId` | Server-stored copy of a plan (trusted prices) |
| POST | `/api/procurement/plans/:planId/revalidate` | Re-check the approved basket right before payment |
| GET | `/api/procurement/catalog` · `/contract` | Demo catalog · supported constraints |
| GET | `/api/paypal/status` · `/test-connection` | PayPal sandbox configuration check |
| POST | `/api/paypal/create-order` · `/capture-order` | PayPal sandbox checkout |

## Use of AI

- **Request agent:** an LLM interprets the user's request and produces structured JSON (budget, categories, quantities, hard constraints, preference weights), asking clarifying questions when needed.
- **Deterministic engine:** verification and optimization are rule-based on purpose, so budgets, specs and totals are checked exactly and every recommendation can be explained. No AI output is trusted for prices or constraint checks.
- **Development:** parts of the code, tests and documentation were written with AI coding assistants (Claude) and reviewed by the team.

## Honest limitations

- The product catalog (`src/catalog.json`) is **synthetic demo data**: the brands are fictional and prices, stock and delivery are illustrative. Plans label every item `UNVERIFIED_DEMO_DATA`. The catalog provider is pluggable, so a live product source can replace it (see the docs).
- Plans are stored in memory, so a server restart clears them.
- The PayPal flow runs in the **sandbox** only, so no real money moves.

## License

[MIT](LICENSE)
