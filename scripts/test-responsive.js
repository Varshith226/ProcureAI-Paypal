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

async function runResponsiveTests() {
  console.log("=================================================");
  console.log("  ProcureAI Responsive & Overflow Visual Tests");
  console.log("=================================================\n");

  const PORT = 3099;
  process.env.PORT = String(PORT);

  // Boot server in-process
  const app = require("../server");
  const server = app.listen(PORT, "127.0.0.1");

  const baseUrl = `http://127.0.0.1:${PORT}`;
  const ready = await waitForServer(`${baseUrl}/api/health`);
  if (!ready) {
    console.error("Failed to connect to local test server.");
    server.close();
    process.exit(1);
  }
  console.log(`✓ Test server running at ${baseUrl}`);

  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const viewports = [
    { name: "mobile-390x844", width: 390, height: 844, isMobile: true, hasTouch: true },
    { name: "desktop-1440x900", width: 1440, height: 900, isMobile: false, hasTouch: false },
  ];

  const results = [];

  for (const vp of viewports) {
    console.log(`\nTesting viewport: ${vp.name} (${vp.width}x${vp.height})...`);
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: vp.isMobile ? 2 : 1,
      isMobile: vp.isMobile,
      hasTouch: vp.hasTouch,
    });

    const page = await context.newPage();

    // 1. Dashboard View
    await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 15000 });
    await page.waitForTimeout(1500);

    const overflowCheck = await page.evaluate(() => {
      const docEl = document.documentElement;
      const body = document.body;
      const scrollWidth = Math.max(docEl.scrollWidth, body.scrollWidth);
      const clientWidth = docEl.clientWidth || window.innerWidth;
      const hasOverflow = scrollWidth > clientWidth;
      const culprits = [];
      if (hasOverflow) {
        document.querySelectorAll("*").forEach((el) => {
          const r = el.getBoundingClientRect();
          if (r.right > clientWidth + 0.5) {
            culprits.push({
              tag: el.tagName,
              cls: typeof el.className === "string" ? el.className.slice(0, 40) : "",
              right: Math.round(r.right),
              width: Math.round(r.width),
              scrollWidth: el.scrollWidth,
              text: (el.innerText || "").slice(0, 40).replace(/\n/g, " ")
            });
          }
        });
      }
      return {
        hasOverflow,
        scrollWidth,
        clientWidth,
        delta: Math.max(0, scrollWidth - clientWidth),
        culprits: culprits.slice(0, 8),
      };
    });

    console.log(`   Dashboard: clientWidth=${overflowCheck.clientWidth}px, scrollWidth=${overflowCheck.scrollWidth}px (delta: ${overflowCheck.delta}px)`);
    if (overflowCheck.culprits && overflowCheck.culprits.length > 0) {
      console.log("   Culprits:", JSON.stringify(overflowCheck.culprits, null, 2));
    }

    const dashboardScreenshotPath = path.join(SCREENSHOTS_DIR, `${vp.name}-dashboard.png`);
    await page.screenshot({ path: dashboardScreenshotPath, fullPage: false });
    console.log(`   ✓ Saved screenshot: ${dashboardScreenshotPath}`);

    // 2. Single-Use Token Remote Approval View
    const approvalUrl = `${baseUrl}?token=sample_demo_approval_token_12345`;
    await page.goto(approvalUrl, { waitUntil: "domcontentloaded", timeout: 15000 });
    await page.waitForTimeout(1000);

    const approvalOverflowCheck = await page.evaluate(() => {
      const docEl = document.documentElement;
      const body = document.body;
      const scrollWidth = Math.max(docEl.scrollWidth, body.scrollWidth);
      const clientWidth = docEl.clientWidth || window.innerWidth;
      const hasOverflow = scrollWidth > clientWidth;
      return {
        hasOverflow,
        scrollWidth,
        clientWidth,
        delta: Math.max(0, scrollWidth - clientWidth),
      };
    });

    console.log(`   Approval Page: clientWidth=${approvalOverflowCheck.clientWidth}px, scrollWidth=${approvalOverflowCheck.scrollWidth}px (delta: ${approvalOverflowCheck.delta}px)`);

    const approvalScreenshotPath = path.join(SCREENSHOTS_DIR, `${vp.name}-approval.png`);
    await page.screenshot({ path: approvalScreenshotPath, fullPage: false });
    console.log(`   ✓ Saved screenshot: ${approvalScreenshotPath}`);

    results.push({
      viewport: vp.name,
      width: vp.width,
      height: vp.height,
      dashboardOverflow: overflowCheck.hasOverflow,
      approvalOverflow: approvalOverflowCheck.hasOverflow,
      overflowDelta: overflowCheck.delta,
      dashboardScreenshot: dashboardScreenshotPath,
      approvalScreenshot: approvalScreenshotPath,
    });

    await context.close();
  }

  await browser.close();
  server.close();

  console.log("\n=================== SUMMARY ===================");
  let failed = false;
  for (const r of results) {
    if (r.dashboardOverflow || r.approvalOverflow) {
      console.error(`❌ FAILED: ${r.viewport} has horizontal overflow (delta: ${r.overflowDelta}px)!`);
      failed = true;
    } else {
      console.log(`✓ PASSED: ${r.viewport} zero horizontal overflow!`);
    }
  }

  if (failed) {
    process.exit(1);
  }
}

if (require.main === module) {
  runResponsiveTests().catch((err) => {
    console.error("Test error:", err);
    process.exit(1);
  });
}

module.exports = { runResponsiveTests };
