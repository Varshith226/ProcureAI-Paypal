
require("dotenv").config();

const express = require("express");
const crypto = require("node:crypto");

const app = express();
app.use(express.json());

const {
  PAYPAL_CLIENT_ID,
  PAYPAL_CLIENT_SECRET,
  PAYPAL_BASE_URL,
} = process.env;

app.get("/", (req, res) => {
  res.json({
    message: "PayPal AI Hackathon backend is running!",
    environment: "sandbox",
  });
});

app.get("/api/paypal/status", (req, res) => {
  res.json({
    configured: Boolean(
      PAYPAL_CLIENT_ID &&
      PAYPAL_CLIENT_SECRET &&
      PAYPAL_BASE_URL
    ),
    environment: "sandbox",
  });
});

app.get("/api/paypal/test-connection", async (req, res) => {
  if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET || !PAYPAL_BASE_URL) {
    return res.status(500).json({
      error: "Missing PayPal sandbox credentials in .env",
    });
  }

  try {
    const credentials = Buffer.from(
      `${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`
    ).toString("base64");

    const response = await fetch(
      `${PAYPAL_BASE_URL}/v1/oauth2/token`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${credentials}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: "grant_type=client_credentials",
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: "PayPal authentication failed",
        details: data.error_description || data.message || data.error,
      });
    }

    res.json({
      connected: true,
      environment: "sandbox",
      message: "PayPal authentication successful!",
    });
  } catch (error) {
    res.status(502).json({
      error: "Could not connect to PayPal",
    });
  }
});


async function getPayPalAccessToken() {
  const credentials = Buffer.from(
    `${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`
  ).toString("base64");

  const response = await fetch(
    `${PAYPAL_BASE_URL}/v1/oauth2/token`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error("PayPal authentication failed");
  }

  return data.access_token;
}

// Create a sandbox order
app.post("/api/paypal/create-order", async (req, res) => {
  try {
    const token = await getPayPalAccessToken();

    const response = await fetch(
      `${PAYPAL_BASE_URL}/v2/checkout/orders`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "PayPal-Request-Id": crypto.randomUUID(),
        },
        body: JSON.stringify({
          intent: "CAPTURE",
          purchase_units: [
            {
              amount: {
                currency_code: "USD",
                value: "5.00",
              },
              description: "PayPal AI Hackathon sandbox test",
            },
          ],
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: "Could not create PayPal order",
        details: data.message,
      });
    }

    const approval = data.links?.find(
      (link) => link.rel === "approve"
    );

    res.json({
      orderID: data.id,
      approvalUrl: approval?.href,
    });
  } catch (error) {
    res.status(502).json({ error: error.message });
  }
});

// Capture an approved sandbox order
app.post("/api/paypal/capture-order", async (req, res) => {
  const { orderID } = req.body;

  if (!orderID) {
    return res.status(400).json({ error: "orderID is required" });
  }

  try {
    const token = await getPayPalAccessToken();

    const response = await fetch(
      `${PAYPAL_BASE_URL}/v2/checkout/orders/${encodeURIComponent(orderID)}/capture`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "PayPal-Request-Id": crypto.randomUUID(),
        },
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: "Could not capture PayPal order",
        details: data.message,
      });
    }

    res.json({
      orderID: data.id,
      status: data.status,
      captureID:
        data.purchase_units?.[0]?.payments?.captures?.[0]?.id,
    });
  } catch (error) {
    res.status(502).json({ error: error.message });
  }
});


const PORT = 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
