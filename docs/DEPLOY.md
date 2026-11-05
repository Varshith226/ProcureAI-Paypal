# ProcureAI Deployment Guide (Render Starter + Persistent Disk)

This guide covers deploying **ProcureAI** as a single production web service on **Render** backed by a 1GB persistent SQLite disk, using hackathon cloud credits.

---

## 1. Quick Deploy via Render Blueprint

1. Fork or push this repository to GitHub.
2. Sign in to your [Render Dashboard](https://dashboard.render.com/).
3. Click **New +** -> **Blueprint**.
4. Connect this repository and select `render.yaml`.
5. Render will automatically detect the web service configuration, persistent disk at `/var/data`, and environment variables.

*(If you are on the Render Free Tier without persistent disk capabilities, use `render.free.yaml` instead.)*

---

## 2. Environment Variables Specification

| Variable | Scope | Type | Required | Description |
|---|---|---|:---:|---|
| `NODE_VERSION` | Build & Runtime | System | Yes | Must be `22.13.0` or `24.x` (native unflagged `node:sqlite`). |
| `NODE_ENV` | Runtime | Config | Yes | Set to `production`. |
| `PORT` | Runtime | Config | No | Assigned automatically by Render (defaults to `3000`). |
| `PUBLIC_BASE_URL` | Runtime | URL | **Yes** | Your public Render URL (e.g. `https://procureai.onrender.com`). Drives PayPal returns & CORS. |
| `DB_PATH` | Runtime | Path | Yes | `/var/data/procureai.db` (Starter disk) or `/tmp/procureai.db` (Free). |
| `PAYPAL_BASE_URL` | Runtime | URL | Yes | `https://api-m.sandbox.paypal.com` (Sandbox only). |
| `PAYPAL_CLIENT_ID` | Runtime | Secret | Yes | Sandbox REST App Client ID from developer.paypal.com. |
| `PAYPAL_CLIENT_SECRET` | Runtime | Secret | Yes | Sandbox REST App Secret. |
| `PAYPAL_WEBHOOK_ID` | Runtime | Secret | Optional | Webhook ID for live HMAC signature verification. |
| `GEMINI_API_KEY` | Runtime | Secret | Optional | Google AI Studio key for live Gemini 2.5 Flash parsing. If omitted, engine uses deterministic heuristic parser. |
| `DEMO_RESET_KEY` | Runtime | Secret | Optional | Secret passphrase required to invoke `POST /api/demo/reset` in production. |
| `CHANNEL3_API_KEY` | Runtime | Secret | Optional | Merchant aggregator API key. If omitted, uses verified local catalog. |

> **Note on Build vs Runtime:** All secrets are strictly server-side runtime variables. The React frontend is pre-built via `npm --prefix client run build` and served from Express with zero embedded API keys.

---

## 3. Applying Render Hackathon Credits ($50)

1. Open your [Render Account Settings / Billing](https://dashboard.render.com/billing).
2. Under **Credits / Promo Code**, enter your Devpost / hackathon attendee credit coupon code.
3. Verify that the $50 credit balance is applied to your workspace before provisioning the **Starter Web Service ($7/mo)** and **Persistent Disk ($0.25/mo for 1GB)**.
4. Your service will remain fully funded through December 2026.

---

## 4. Configuring PayPal Sandbox Webhooks

To receive live asynchronous webhook updates from PayPal Sandbox:

1. Go to [PayPal Developer Dashboard](https://developer.paypal.com/dashboard/applications/sandbox).
2. Select your REST API App.
3. Under **Webhooks**, click **Add Webhook**.
4. Webhook URL: `https://<your-render-subdomain>.onrender.com/api/paypal/webhook`
5. Select the following 6 core event triggers:
   - `Checkout order approved` (`CHECKOUT.ORDER.APPROVED`)
   - `Payment authorization created` (`PAYMENT.AUTHORIZATION.CREATED`)
   - `Payment authorization voided` (`PAYMENT.AUTHORIZATION.VOIDED`)
   - `Payment capture completed` (`PAYMENT.CAPTURE.COMPLETED`)
   - `Payment capture refunded` (`PAYMENT.CAPTURE.REFUNDED`)
   - `Payment capture denied` (`PAYMENT.CAPTURE.DENIED`)
6. Copy the generated **Webhook ID** and set it as `PAYPAL_WEBHOOK_ID` in your Render Environment settings.

---

## 5. Post-Judging Cleanup: Suspend Service & Rotate Keys

Once hackathon evaluation concludes (after Dec 15, 2026):
1. In the Render Dashboard, navigate to your `procureai` web service.
2. Click **Settings** -> **Suspend Service** (stops compute hours while preserving disk data).
3. If decommissioning permanently, click **Delete Service**.
4. In Google AI Studio and PayPal Developer Dashboard, rotate or delete the API keys generated for the hackathon.

---

## 6. Troubleshooting Common Production Issues

| Issue | Root Cause | Solution |
|---|---|---|
| **Boot Crash: Cannot find module 'node:sqlite'** | Render defaulted to Node < 22.13 | Ensure `NODE_VERSION` is set to `24.22.1` or `>=22.13.0` in Render env vars. |
| **Blank Page / Script Blocked (CSP)** | Content Security Policy blocked PayPal SDK | Helmet is pre-configured for `*.paypal.com` and `*.paypalobjects.com`. Ensure no custom ad-blocker interferes. |
| **PayPal 422: ORDER_NOT_APPROVED** | Buyer clicked authorize before approving on PayPal | The UI guides the user to complete buyer login in the sandbox tab before finalizing authorization. |
| **Webhook 401: WEBHOOK_UNCONFIGURED** | PayPal webhook received without `PAYPAL_WEBHOOK_ID` | Set `PAYPAL_WEBHOOK_ID` in Render env vars, or use the interactive "Simulate Webhook" button. |
| **CORS Error on API Calls** | `PUBLIC_BASE_URL` does not match the deployed domain | Set `PUBLIC_BASE_URL` in Render to match `https://<your-app>.onrender.com` without a trailing slash. |
| **SSE Connection Drops after 60s** | Reverse proxy buffer timeout | ProcureAI emits an automatic `: heartbeat\n\n` comment every 15s and sets `X-Accel-Buffering: no`. |
| **Data Resets on Deploy / Restart** | Running in ephemeral disk mode (Free Tier) | Upgrade to Render Starter ($7/mo using hackathon credits) with 1GB disk mounted at `/var/data`. |

