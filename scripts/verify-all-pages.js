// scripts/verify-all-pages.js
const { chromium } = require("playwright");
const path = require("node:path");
const fs = require("node:fs");

const SCREENSHOTS_DIR = path.join(__dirname, "../docs/screenshots");
if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

async function verifyAllPages() {
  console.log("Starting visual verification across all pages...");
  const app = require("../server");
  const server = app.listen(3097, "127.0.0.1");
  const baseUrl = "http://127.0.0.1:3097";

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  const pageErrors = [];
  page.on("pageerror", err => pageErrors.push(err.message));

  // 1. Step 0
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "v2-step0-request.png"), fullPage: false });
  console.log("✓ Step 0 screenshot captured");

  // 2. Click 1️⃣ Request: ₹60k Setup
  const btn1 = page.locator("text=1️⃣ Request: ₹60k Setup");
  if (await btn1.isVisible()) {
    await btn1.click();
    await page.waitForTimeout(500);
  }

  // 3. Click 2️⃣ AG Grid Live Matrix (Transitions to Step 1)
  const btn2 = page.locator("text=2️⃣ AG Grid Live Matrix");
  if (await btn2.isVisible()) {
    await btn2.click();
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "v2-step1-strategy.png"), fullPage: false });
    console.log("✓ Step 1 screenshot captured");
  }

  // 4. Click 4️⃣ Mandate & Authorization Hold (Transitions to Step 2)
  const btn4 = page.locator("text=4️⃣ Mandate & Authorization Hold");
  if (await btn4.isVisible()) {
    await btn4.click();
    await page.waitForTimeout(1200);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "v2-step2-mandate-checkout.png"), fullPage: false });
    console.log("✓ Step 2 (Mandate & Checkout) screenshot captured");
  }

  const mandateCardVisible = await page.locator("text=Cryptographically Signed Spending Mandate").first().isVisible();
  console.log("✓ Mandate Card visible:", mandateCardVisible);

  const overflowStep2 = await page.evaluate(() => {
    return document.documentElement.scrollWidth > document.documentElement.clientWidth;
  });
  console.log("✓ Step 2 Desktop horizontal overflow:", overflowStep2);

  // Test mobile viewport (390x844) on Step 2
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "v2-step2-mobile.png"), fullPage: false });
  const overflowMobileStep2 = await page.evaluate(() => {
    return document.documentElement.scrollWidth > document.documentElement.clientWidth;
  });
  console.log("✓ Step 2 Mobile horizontal overflow:", overflowMobileStep2);

  // Restore desktop viewport
  await page.setViewportSize({ width: 1440, height: 900 });

  // 5. Test Step 3
  const btn6 = page.locator("text=6️⃣ Confirm Delivery (Capture & Payout)");
  if (await btn6.isVisible()) {
    await btn6.click();
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "v2-step3-receipt.png"), fullPage: false });
    console.log("✓ Step 3 (Settlement Receipt) screenshot captured");
  }

  const overflowStep3 = await page.evaluate(() => {
    return document.documentElement.scrollWidth > document.documentElement.clientWidth;
  });
  console.log("✓ Step 3 Desktop horizontal overflow:", overflowStep3);

  console.log("\nTotal page errors encountered:", pageErrors.length);
  if (pageErrors.length > 0) {
    console.error("Page errors:", pageErrors);
  }

  await browser.close();
  server.close();
}

verifyAllPages().catch(err => {
  console.error("Verification failed:", err);
  process.exit(1);
});
