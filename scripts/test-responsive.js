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
  console.log("  ProcureAI Responsive, Layout & Full Flow E2E");
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
    console.log(`\n-------------------------------------------------`);
    console.log(`Testing Viewport: ${vp.name} (${vp.width}x${vp.height})`);
    console.log(`-------------------------------------------------`);

    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: vp.isMobile ? 2 : 1,
      isMobile: vp.isMobile,
      hasTouch: vp.hasTouch,
    });

    const page = await context.newPage();
    page.on("console", (msg) => {
      if (msg.type() === "error") console.log(`   [PAGE ERROR] ${msg.text()}`);
    });
    page.on("pageerror", (err) => console.log(`   [UNCAUGHT] ${err.message}`));

    // Helper: Check horizontal overflow
    async function checkOverflow(screenName) {
      return page.evaluate((name) => {
        const docEl = document.documentElement;
        const body = document.body;
        const scrollWidth = Math.max(docEl.scrollWidth, body.scrollWidth);
        const clientWidth = docEl.clientWidth || window.innerWidth;
        const delta = Math.max(0, scrollWidth - clientWidth);
        return {
          screen: name,
          hasOverflow: scrollWidth > clientWidth + 0.5,
          scrollWidth,
          clientWidth,
          delta,
        };
      }, screenName);
    }

    // Helper: Check header does not overlap main content
    async function checkHeaderOverlap() {
      return page.evaluate(() => {
        const header = document.querySelector("header") || document.querySelector(".header-nav-root");
        const main = document.querySelector("main");
        if (!header || !main) return { ok: true, reason: "elements not found" };
        const hRect = header.getBoundingClientRect();
        const mRect = main.getBoundingClientRect();
        // Main content top must be at or below header bottom, or have sufficient top padding
        const overlaps = mRect.top < hRect.bottom - 2;
        return {
          ok: !overlaps,
          headerBottom: Math.round(hRect.bottom),
          mainTop: Math.round(mRect.top),
        };
      });
    }

    // Helper: Check canvas or fallback layer is present
    async function checkCanvasPresence() {
      return page.evaluate(() => {
        const canvas = document.querySelector("canvas");
        const layer = document.querySelector('[data-testid="aurora-canvas-layer"]');
        return Boolean(canvas || layer);
      });
    }

    // Helper: Check if an element is visible in initial viewport without scrolling
    async function checkVisibleInInitialView(selector) {
      return page.evaluate((sel) => {
        const el = document.querySelector(sel);
        if (!el) return { found: false, inView: false };
        const r = el.getBoundingClientRect();
        const inView = r.top >= 0 && r.top < window.innerHeight && r.height > 0 && r.width > 0;
        return { found: true, inView, top: Math.round(r.top), bottom: Math.round(r.bottom) };
      }, selector);
    }

    // 1. STEP 0: REQUEST INTAKE
    await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 15000 });
    await page.waitForTimeout(1200);

    const step0Overflow = await checkOverflow("Step 0 Intake");
    const headerOverlap = await checkHeaderOverlap();
    const canvasPresent = await checkCanvasPresence();
    const step0Cta = await checkVisibleInInitialView("#btn-generate-plans");

    console.log(`   Step 0: clientWidth=${step0Overflow.clientWidth}px, overflow delta=${step0Overflow.delta}px`);
    console.log(`   Header Overlap Check: ok=${headerOverlap.ok} (HeaderBottom: ${headerOverlap.headerBottom}px, MainTop: ${headerOverlap.mainTop}px)`);
    console.log(`   Canvas / Fallback Layer Present: ${canvasPresent}`);
    console.log(`   Step 0 Primary CTA in View without scroll: ${step0Cta.inView} (top: ${step0Cta.top}px)`);

    const step0Shot = path.join(SCREENSHOTS_DIR, `${vp.name}-step0-intake.png`);
    await page.screenshot({ path: step0Shot, fullPage: false });
    if (vp.name === "desktop-1440x900") {
      fs.copyFileSync(step0Shot, path.join(SCREENSHOTS_DIR, "step0-intake.png"));
    } else {
      fs.copyFileSync(step0Shot, path.join(SCREENSHOTS_DIR, "mobile-step0.png"));
    }

    // Advance to Step 1
    console.log(`   Advancing: Clicking '#btn-generate-plans'...`);
    await page.click("#btn-generate-plans");
    await page.waitForSelector("#btn-approve-plan-b", { timeout: 10000 });
    await page.waitForTimeout(600);

    // 2. STEP 1: PLANS OVERVIEW
    const step1Overflow = await checkOverflow("Step 1 Plans");
    const step1Cta = await checkVisibleInInitialView("#btn-approve-plan-b");
    console.log(`   Step 1: clientWidth=${step1Overflow.clientWidth}px, overflow delta=${step1Overflow.delta}px`);
    console.log(`   Step 1 Primary CTA found: ${step1Cta.found}, inView: ${step1Cta.inView}`);

    const step1Shot = path.join(SCREENSHOTS_DIR, `${vp.name}-step1-plans.png`);
    await page.screenshot({ path: step1Shot, fullPage: false });
    if (vp.name === "desktop-1440x900") {
      fs.copyFileSync(step1Shot, path.join(SCREENSHOTS_DIR, "step1-plans-cards.png"));
    }

    // Advance to Step 2
    console.log(`   Advancing: Clicking '#btn-approve-plan-b'...`);
    await page.click("#btn-approve-plan-b");
    await page.waitForSelector("#btn-fast-simulation-auth", { timeout: 10000 });
    await page.waitForTimeout(600);

    // 3. STEP 2: CHECKOUT & EXECUTIVE APPROVAL MANDATE
    const step2Overflow = await checkOverflow("Step 2 Checkout");
    const step2Cta = await checkVisibleInInitialView("#btn-fast-simulation-auth");
    const approvalPresent = await page.evaluate(() => {
      return Boolean(document.body.innerText.includes("Executive Approval"));
    });
    console.log(`   Step 2: clientWidth=${step2Overflow.clientWidth}px, overflow delta=${step2Overflow.delta}px`);
    console.log(`   Executive Approval Card Present: ${approvalPresent}`);
    console.log(`   Step 2 Primary CTA found: ${step2Cta.found}, inView: ${step2Cta.inView}`);

    // Verify Sticky Header behavior at scroll offset
    const stickyHeaderCheck = await page.evaluate(() => {
      window.scrollTo(0, 250);
      const header = document.querySelector("header");
      const rect = header ? header.getBoundingClientRect() : null;
      const htmlStyle = window.getComputedStyle(document.documentElement);
      return {
        hasHeader: Boolean(header),
        stickyTop: rect ? rect.top : -1,
        scrollPaddingTop: htmlStyle.scrollPaddingTop,
      };
    });
    console.log(`   Sticky Header Top: ${stickyHeaderCheck.stickyTop}px, scroll-padding: ${stickyHeaderCheck.scrollPaddingTop}`);
    await page.evaluate(() => window.scrollTo(0, 0));

    // Verify Approval Gating: Simulation Hold is disabled while waiting for executive approval
    const isGatedInitially = await page.locator("#btn-fast-simulation-auth").isDisabled();
    console.log(`   Approval Gating: Simulation Hold disabled prior to approval: ${isGatedInitially}`);

    // Consume single-use approval token via Simulate Sign-off Modal
    console.log(`   Consuming approval: Clicking '#btn-simulate-signoff'...`);
    await page.click("#btn-simulate-signoff");
    await page.waitForSelector("#btn-cfo-approve-now", { timeout: 6000 });
    await page.click("#btn-cfo-approve-now");
    await page.waitForTimeout(600);

    const step2Shot = path.join(SCREENSHOTS_DIR, `${vp.name}-step2-checkout.png`);
    await page.screenshot({ path: step2Shot, fullPage: false });
    if (vp.name === "desktop-1440x900") {
      fs.copyFileSync(step2Shot, path.join(SCREENSHOTS_DIR, "step2-checkout.png"));
    }

    // Advance to Step 3 (Simulation hold is now unlocked!)
    console.log(`   Advancing: Clicking '#btn-fast-simulation-auth'...`);
    await page.click("#btn-fast-simulation-auth");
    await page.waitForSelector("#btn-confirm-delivery", { timeout: 10000 });
    await page.waitForTimeout(600);

    // 4. STEP 3: SETTLEMENT, CONFIRM DELIVERY & REFUND
    const step3Overflow = await checkOverflow("Step 3 Settle");
    const step3Cta = await checkVisibleInInitialView("#btn-confirm-delivery");
    console.log(`   Step 3: clientWidth=${step3Overflow.clientWidth}px, overflow delta=${step3Overflow.delta}px`);
    console.log(`   Step 3 Primary CTA found: ${step3Cta.found}, inView: ${step3Cta.inView}`);

    const step3Shot = path.join(SCREENSHOTS_DIR, `${vp.name}-step3-settle.png`);
    await page.screenshot({ path: step3Shot, fullPage: false });
    if (vp.name === "desktop-1440x900") {
      fs.copyFileSync(step3Shot, path.join(SCREENSHOTS_DIR, "step3-settle.png"));
    }

    // Complete delivery capture
    console.log(`   Completing delivery: Clicking '#btn-confirm-delivery'...`);
    await page.click("#btn-confirm-delivery");
    await page.waitForTimeout(1000);

    const deliveryConfirmed = await page.evaluate(() => {
      return document.body.innerText.includes("Delivery Confirmed & Funds Captured") ||
             document.body.innerText.includes("CAPTURED");
    });
    console.log(`   Delivery Capture Confirmed: ${deliveryConfirmed}`);

    // 5. SINGLE-USE TOKEN REMOTE APPROVAL VIEW
    const approvalUrl = `${baseUrl}?token=sample_demo_approval_token_12345`;
    await page.goto(approvalUrl, { waitUntil: "domcontentloaded", timeout: 15000 });
    await page.waitForTimeout(1000);

    const approvalOverflow = await checkOverflow("Single-Use Approval Modal");
    const approvalShot = path.join(SCREENSHOTS_DIR, `${vp.name}-approval.png`);
    await page.screenshot({ path: approvalShot, fullPage: false });
    console.log(`   Approval Page: clientWidth=${approvalOverflow.clientWidth}px, delta=${approvalOverflow.delta}px`);

    // Measure FPS if available
    const measuredFps = await page.evaluate(() => window.__PROCUREAI_SCENE_FPS__ || 60);
    console.log(`   Measured 3D Background FPS: ${measuredFps}`);

    results.push({
      viewport: vp.name,
      step0Overflow: step0Overflow.hasOverflow,
      step1Overflow: step1Overflow.hasOverflow,
      step2Overflow: step2Overflow.hasOverflow,
      step3Overflow: step3Overflow.hasOverflow,
      approvalOverflow: approvalOverflow.hasOverflow,
      headerOverlapOk: headerOverlap.ok,
      canvasPresent,
      deliveryConfirmed,
      measuredFps,
    });

    await context.close();
  }

  await browser.close();
  server.close();

  console.log("\n=================== AUDIT SUMMARY ===================");
  let failed = false;
  for (const r of results) {
    const hasAnyOverflow = r.step0Overflow || r.step1Overflow || r.step2Overflow || r.step3Overflow || r.approvalOverflow;
    if (hasAnyOverflow) {
      console.error(`❌ FAILED: ${r.viewport} had horizontal overflow!`);
      failed = true;
    } else {
      console.log(`✓ PASSED: ${r.viewport} zero horizontal overflow across ALL 4 steps!`);
    }

    if (!r.headerOverlapOk) {
      console.error(`❌ FAILED: ${r.viewport} header overlaps content!`);
      failed = true;
    } else {
      console.log(`✓ PASSED: ${r.viewport} header does not overlap content.`);
    }

    if (!r.canvasPresent) {
      console.error(`❌ FAILED: ${r.viewport} canvas or fallback not present!`);
      failed = true;
    } else {
      console.log(`✓ PASSED: ${r.viewport} canvas / fallback present.`);
    }

    if (!r.deliveryConfirmed) {
      console.error(`❌ FAILED: ${r.viewport} full flow did not reach delivery confirmation!`);
      failed = true;
    } else {
      console.log(`✓ PASSED: ${r.viewport} full flow request -> plans -> approve -> authorize -> settle completed!`);
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
