"use strict";

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { chromium } = require("playwright");

async function waitForHttp(url, timeoutMs = 15000) {
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

async function runLighthouseAudit() {
  console.log("=================================================");
  console.log("  ProcureAI Mobile Lighthouse Audit (Live Run)");
  console.log("=================================================\n");

  const app = require("../server");
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(3088, "0.0.0.0", resolve));

  const baseUrl = "http://localhost:3088";
  console.log(`✓ Test server running at ${baseUrl}`);

  const ready = await waitForHttp(`${baseUrl}/api/health`);
  if (!ready) {
    console.error("Failed to connect to local test server.");
    server.close();
    process.exit(1);
  }

  const DEBUG_PORT = 9222;
  console.log(`Launching Playwright Chromium on debug port ${DEBUG_PORT}...`);
  const browser = await chromium.launch({
    headless: true,
    args: [
      `--remote-debugging-port=${DEBUG_PORT}`,
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-gpu",
      "--disable-dev-shm-usage",
    ],
  });

  const debugReady = await waitForHttp(`http://127.0.0.1:${DEBUG_PORT}/json/version`, 10000);
  if (!debugReady) {
    console.error("Failed to connect to Chrome debugging endpoint.");
    await browser.close();
    server.close();
    process.exit(1);
  }
  console.log(`✓ Chrome debugging port ${DEBUG_PORT} is active.`);

  const lighthouse = (await import("lighthouse")).default;

  const flags = {
    port: DEBUG_PORT,
    output: "json",
    onlyCategories: ["performance", "accessibility"],
    formFactor: "mobile",
    screenEmulation: {
      mobile: true,
      width: 390,
      height: 844,
      deviceScaleFactor: 2,
      disabled: false,
    },
    throttlingMethod: "provided",
  };

  try {
    console.log(`Running Lighthouse audit against ${baseUrl}...`);
    const runnerResult = await lighthouse(baseUrl, flags);
    const lhr = runnerResult.lhr || (runnerResult.report ? JSON.parse(runnerResult.report) : {});

    if (lhr.runtimeError) {
      console.log("Lighthouse runtimeError:", lhr.runtimeError);
    }

    const perfScore = Math.round((lhr.categories?.performance?.score || 0) * 100);
    const a11yScore = Math.round((lhr.categories?.accessibility?.score || 0) * 100);

    console.log("\n=================== AUDIT RESULTS ===================");
    console.log(`- Performance:   ${perfScore}/100`);
    console.log(`- Accessibility: ${a11yScore}/100`);
    console.log("=====================================================\n");

    const reportPath = path.join(__dirname, "../docs/screenshots/lighthouse-mobile-report.json");
    fs.writeFileSync(reportPath, JSON.stringify({
      performance: perfScore,
      accessibility: a11yScore,
      audits: {
        fcp: lhr.audits?.["first-contentful-paint"]?.displayValue,
        lcp: lhr.audits?.["largest-contentful-paint"]?.displayValue,
        cls: lhr.audits?.["cumulative-layout-shift"]?.displayValue,
        totalBlockingTime: lhr.audits?.["total-blocking-time"]?.displayValue,
      },
      timestamp: new Date().toISOString(),
    }, null, 2));

    console.log(`✓ Saved report summary to ${reportPath}`);

    await browser.close();
    server.close();
    return { performance: perfScore, accessibility: a11yScore };
  } catch (err) {
    console.error("Lighthouse execution error:", err.message);
    await browser.close();
    server.close();
    return { error: err.message };
  }
}

if (require.main === module) {
  runLighthouseAudit().catch(console.error);
}

module.exports = { runLighthouseAudit };
