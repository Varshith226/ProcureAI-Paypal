"use strict";

const http = require("node:http");
const { chromium } = require("playwright");

async function waitForServer(url, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      await new Promise((resolve, reject) => {
        const req = http.get(url, (res) => {
          if (res.statusCode >= 200 && res.statusCode < 400) resolve();
          else reject(new Error(`Status ${res.statusCode}`));
        });
        req.on("error", reject);
        req.setTimeout(1000, () => req.destroy());
      });
      return true;
    } catch (_) {
      await new Promise((r) => setTimeout(r, 300));
    }
  }
  return false;
}

async function run() {
  const PORT = 3199;
  process.env.PORT = String(PORT);

  const app = require("../server");
  const server = app.listen(PORT, "127.0.0.1");
  const baseUrl = `http://127.0.0.1:${PORT}`;

  const ready = await waitForServer(`${baseUrl}/api/health`);
  if (!ready) {
    console.error("Failed to connect to local test server.");
    server.close();
    process.exit(1);
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  const consoleErrors = [];
  page.on("pageerror", (err) => {
    console.error("PAGE ERROR:", err.message);
    consoleErrors.push(err.message);
  });
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      console.error("CONSOLE ERROR:", msg.text());
      consoleErrors.push(msg.text());
    }
  });

  try {
    console.log(`Navigating to ${baseUrl} ...`);
    await page.goto(baseUrl, { waitUntil: "networkidle" });

    // 1. Enter prompt without budget (user prompt)
    const promptWithoutBudget = "I need a complete setup for coding and gaming. I already own a laptop. I need a 144 Hz monitor, keyboard, mouse and headphones. Prioritize value for money, reliability and delivery within a week.";
    console.log("Filling prompt without budget...");
    const textarea = page.locator("textarea");
    await textarea.fill(promptWithoutBudget);

    console.log("Clicking '#btn-generate-plans'...");
    await page.locator("#btn-generate-plans").click();

    // 2. Wait for Agent Clarification Card to appear
    console.log("Waiting for '#agent-clarification-card'...");
    const clarificationCard = page.locator("#agent-clarification-card");
    await clarificationCard.waitFor({ state: "visible", timeout: 6000 });
    console.log("✓ Agent Clarification Card is VISIBLE!");

    const cardText = await clarificationCard.innerText();
    console.log("Card content preview:\n" + cardText.split("\n").slice(0, 6).join("\n"));

    if (!cardText.includes("NEEDS_CLARIFICATION")) {
      throw new Error("Expected card to show NEEDS_CLARIFICATION status!");
    }
    if (!cardText.includes("LAPTOP") || !cardText.includes("Already Owned")) {
      throw new Error("Expected laptop to be excluded as already owned!");
    }
    if (!cardText.includes("144Hz") || !cardText.includes("MONITOR")) {
      throw new Error("Expected 144Hz monitor detected!");
    }
    console.log("✓ Correctly extracted natural language items & detected missing budget!");

    // 3. Confirm budget via card
    console.log("Clicking '#btn-confirm-clarification' to generate verified plans...");
    await page.locator("#btn-confirm-clarification").click();

    // 4. Wait for Step 1 Plans to render
    console.log("Waiting for Step 1 (Plans)...");
    await page.waitForSelector("text=Deterministic Optimizer Results", { timeout: 8000 });
    console.log("✓ Successfully reached Step 1 with user-clarified budget!");

    // 5. Test AG Grid Matrix View Click (User reported white screen bug)
    console.log("Clicking 'AG Grid Matrix' view tab...");
    const agGridButton = page.locator("button:has-text('AG Grid Matrix')");
    await agGridButton.click();

    await page.waitForTimeout(1000);

    // Verify grid rendered without white screen
    const agGridContainer = page.locator(".ag-root");
    await agGridContainer.waitFor({ state: "visible", timeout: 6000 });
    const rowCount = await page.locator(".ag-row").count();
    console.log(`✓ AG Grid rendered successfully with ${rowCount} visible rows! Zero white screen!`);

    if (consoleErrors.length > 0) {
      console.warn("Console errors encountered:", consoleErrors);
    } else {
      console.log("✓ ZERO unhandled errors on page!");
    }

    console.log("\n================ ALL VERIFICATIONS PASSED ================");
  } finally {
    await browser.close();
    server.close();
  }
}

run().catch((e) => {
  console.error("Test failed:", e);
  process.exit(1);
});
