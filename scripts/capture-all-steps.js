"use strict";

const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { chromium } = require("playwright");

const SCREENSHOTS_DIR = path.join(__dirname, "../docs/screenshots");
if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

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
      await new Promise((r) => setTimeout(r, 400));
    }
  }
  return false;
}

async function captureSteps() {
  const PORT = 3088;
  process.env.PORT = String(PORT);

  const app = require("../server");
  const server = app.listen(PORT, "127.0.0.1");
  const baseUrl = `http://127.0.0.1:${PORT}`;

  await waitForServer(`${baseUrl}/api/health`);
  console.log(`Server ready at ${baseUrl}`);

  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
  });

  // Step 0: Intake
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "step0-intake.png"), fullPage: false });
  console.log("✓ Captured Step 0: Intake");

  // Click Generate Verified Plans -> Step 1
  await page.click("button:has-text('Generate Verified Plans')");
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "step1-plans-cards.png"), fullPage: false });
  console.log("✓ Captured Step 1: Plans Cards View");

  // Click AG Grid Matrix view
  await page.click("button:has-text('AG Grid Matrix')");
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "step1-plans-matrix.png"), fullPage: false });
  console.log("✓ Captured Step 1: Plans AG Grid Matrix");

  // Switch back to cards and click Approve Plan B -> Step 2
  await page.click("button:has-text('Cards View')");
  await page.waitForTimeout(400);
  await page.click("button:has-text('Approve Plan B & Issue Mandate')");
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "step2-checkout.png"), fullPage: false });
  console.log("✓ Captured Step 2: Checkout & Mandate");

  // Click Confirm & Authorize Hold (1-Click Sandbox) -> Step 3
  await page.click("button:has-text('Confirm & Authorize Hold')");
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "step3-settle.png"), fullPage: false });
  console.log("✓ Captured Step 3: Settle & Escrow Release");

  // Also capture mobile view of Step 0 & Step 2
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "mobile-step0.png"), fullPage: false });
  console.log("✓ Captured Mobile Step 0");

  await browser.close();
  server.close();
}

captureSteps().catch((err) => {
  console.error("Capture error:", err);
  process.exit(1);
});

