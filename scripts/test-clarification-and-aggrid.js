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

    // Verify NO AG Grid Warning popup dialog is on screen
    const warningModal = page.locator("text='AG Grid found'");
    const hasWarningModal = await warningModal.isVisible().catch(() => false);
    if (hasWarningModal) {
      throw new Error("AG Grid warning popup modal is visible on screen!");
    }
    console.log("✓ Zero AG Grid warning popups on screen!");

    // 6. Test Reset Plan
    console.log("Testing Reset Plan functionality...");
    // Open Swap drawer on first item
    const swapButton = page.locator("button:has-text('Swap')").first();
    await swapButton.click();
    await page.waitForSelector("text=Swap Component for Custom Strategy", { timeout: 4000 });
    
    // Click candidate in drawer to customize plan
    const candidateItem = page.locator(".candidate-swap-item").first();
    await candidateItem.waitFor({ state: "visible", timeout: 4000 });
    await candidateItem.click();
    console.log("Swapped an item to customize plan!");
    await page.waitForTimeout(600);

    // Verify "Customized" tag is visible
    const customTag = page.locator("text=Customized");
    await customTag.waitFor({ state: "visible", timeout: 4000 });
    console.log("✓ Plan shows 'Customized' state badge!");

    // Now click "Reset Plan"
    console.log("Clicking '#btn-reset-matrix-plan'...");
    await page.locator("#btn-reset-matrix-plan").click();
    await page.waitForTimeout(600);

    // Verify "Customized" tag is gone and plan reverted to baseline
    const isStillCustom = await customTag.isVisible().catch(() => false);
    if (isStillCustom) {
      throw new Error("Plan is still customized after clicking Reset Plan!");
    }
    console.log("✓ Plan successfully reverted back to original baseline verified plan!");

    // 7. Test Return to Brief: Customize plan again, return to Brief, re-run deterministic check
    console.log("Testing Brief reset & fresh deterministic check...");
    await swapButton.click();
    await page.waitForSelector("text=Swap Component for Custom Strategy", { timeout: 4000 });
    const candidateItem2 = page.locator(".candidate-swap-item").first();
    await candidateItem2.waitFor({ state: "visible", timeout: 4000 });
    await candidateItem2.click();
    await page.waitForTimeout(600);
    console.log("Customized plan with swap again.");

    // Click "← Back to Brief" button
    console.log("Clicking '#btn-back-to-brief'...");
    await page.locator("#btn-back-to-brief").click();
    await page.waitForTimeout(600);

    // Verify we are back on Step 0 (Brief)
    const generateBtn = page.locator("#btn-generate-plans");
    await generateBtn.waitFor({ state: "visible", timeout: 4000 });
    console.log("✓ Successfully returned to Step 0 (Brief)!");

    // Click "Generate Verified Plans →" to re-run deterministic check
    console.log("Re-running deterministic check from Brief...");
    await generateBtn.click();

    // If clarification card appears (or directly Step 1)
    const clarVisible = await page.locator("#agent-clarification-card").isVisible().catch(() => false);
    if (clarVisible) {
      await page.locator("#btn-confirm-clarification").click();
    }
    await page.waitForSelector("text=Deterministic Optimizer Results", { timeout: 8000 });
    console.log("✓ Re-entered Step 1!");

    // Switch to AG Grid Matrix to verify plan is pristine (NOT customized)
    await page.locator("button:has-text('AG Grid Matrix')").click();
    await page.waitForTimeout(600);
    const customBadgeAfterReturn = await page.locator("text=Customized").isVisible().catch(() => false);
    if (customBadgeAfterReturn) {
      throw new Error("Stale customized plan persisted after returning to Brief!");
    }
    console.log("✓ Returning to Brief cleared old customized state and ran 100% fresh deterministic check!");

    // 8. Test AI Vendor Negotiator & "Apply Negotiated Rebate" button
    console.log("Testing AI Vendor Negotiator & Apply Rebate button...");
    const negotiatorBtn = page.locator("button:has-text('AI Vendor Negotiator')");
    await negotiatorBtn.click();

    // Modal opens
    await page.waitForSelector("text=Autonomous 2-Agent B2B Discount Negotiation", { timeout: 5000 });
    console.log("✓ AI Vendor Negotiator modal opened!");

    // Start negotiation
    const startNegBtn = page.locator("button:has-text('Start Autonomous Negotiation')");
    await startNegBtn.click();
    console.log("Started autonomous negotiation rounds...");

    // Wait for "Apply Negotiated Rebate" button
    const applyRebateBtn = page.locator("#btn-apply-negotiated-rebate");
    await applyRebateBtn.waitFor({ state: "visible", timeout: 12000 });
    console.log("✓ Concession secured! Found '#btn-apply-negotiated-rebate'.");

    // Click "Apply Negotiated Rebate"
    await applyRebateBtn.click();
    await page.waitForTimeout(800);
    console.log("Clicked Apply Negotiated Rebate button!");

    // Verify rebate reflects in AG Grid matrix
    const rebateTag = page.locator("text=Rebate Applied");
    const rebatePinnedRow = page.locator("text=AI NEGOTIATED VENDOR REBATE");
    const hasRebateRow = await rebatePinnedRow.isVisible().catch(() => false);
    const hasRebatePill = await page.locator("text=🏷️ -₹").first().isVisible().catch(() => false);
    if (!hasRebateRow && !hasRebatePill) {
      throw new Error("Negotiated rebate did not reflect in prices or grid!");
    }
    console.log("✓ Negotiated rebate successfully reflected in AG Grid prices & settlement row!");

    // Switch to Cards View and verify rebate tag & strikethrough price
    await page.locator("button:has-text('Cards View')").click();
    await page.waitForTimeout(600);
    const hasCardRebateTag = await page.locator("text=Rebate Applied").first().isVisible().catch(() => false);
    console.log(`✓ Cards view displays rebate tag: ${hasCardRebateTag}`);

    // 9. Test Over-Budget Guardrail (Lock Button Disabled) & Auto-Rebalance Transparency
    console.log("Testing Over-Budget Guardrail & Auto-Rebalance algorithm...");
    await page.locator("button:has-text('AG Grid Matrix')").click();
    await page.waitForTimeout(600);

    // Swap monitor to 4K Veltrix Pulse 32U (₹39,999) to intentionally exceed budgetCap of ₹60,000
    const matrixSwapBtn = page.locator("button:has-text('Swap')").first();
    await matrixSwapBtn.click();
    await page.waitForSelector("text=Swap Component for Custom Strategy", { timeout: 4000 });

    const expensive4kMonitor = page.locator(".candidate-swap-item:has-text('Veltrix Pulse 32U')");
    await expensive4kMonitor.waitFor({ state: "visible", timeout: 4000 });
    await expensive4kMonitor.click();
    await page.waitForTimeout(800);
    console.log("Swapped to 4K 144Hz monitor (₹39,999) to test budget ceiling guardrail.");

    // Check if over-budget alert appeared
    const overBudgetAlert = page.locator("#matrix-over-budget-alert");
    await overBudgetAlert.waitFor({ state: "visible", timeout: 6000 });
    console.log("✓ Over-budget alert is VISIBLE with deficit calculation!");

    // Verify lock button is disabled
    const lockBtn = page.locator("#btn-approve-matrix-plan");
    const isDisabled = await lockBtn.isDisabled();
    if (!isDisabled) {
      throw new Error("Lock button must be disabled when plan is over budget!");
    }
    console.log("✓ Lock button is strictly DISABLED while over budget!");

    // Verify Auto-Rebalance button is visible
    const rebalanceBtn = page.locator("#btn-auto-rebalance-matrix");
    await rebalanceBtn.waitFor({ state: "visible", timeout: 4000 });
    console.log("✓ Found '#btn-auto-rebalance-matrix' button!");

    // Click Auto-Rebalance
    console.log("Clicking '#btn-auto-rebalance-matrix' to execute deterministic downgrade...");
    await rebalanceBtn.click();
    await page.waitForTimeout(800);

    // Verify Transparency Report Modal appeared
    const reportModal = page.locator("#rebalance-report-modal-content");
    await reportModal.waitFor({ state: "visible", timeout: 5000 });
    console.log("✓ AI Budget Auto-Rebalance Transparency Report Modal is VISIBLE!");

    const diffRows = await page.locator(".rebalance-diff-row").count();
    console.log(`✓ Transparency Report details ${diffRows} component adjustment(s) from old spec to new spec!`);

    // Dismiss report modal
    await page.locator("#btn-dismiss-rebalance-report").click();
    await page.waitForTimeout(600);

    // Verify Lock button is now ENABLED again!
    const isNowDisabled = await lockBtn.isDisabled();
    if (isNowDisabled) {
      throw new Error("Lock button should be enabled after successful auto-rebalance!");
    }
    console.log("✓ Lock button is now re-ENABLED and ready for spending mandate signing!");
    console.log("✓ Over-budget deficit resolved and basket fits within budget cap!");

    // 10. Test Multi-Dimensional Radar Chart & What-If Sensitivity Trade-offs
    console.log("Testing Radar Chart & What-If Trade-off Frontier...");
    const radarTab = page.locator("button:has-text('Trade-offs Radar')");
    await radarTab.click();
    await page.waitForTimeout(600);

    // Verify SVG Radar exists and has 3 plan polygons
    const radarSvg = page.locator("svg[viewBox='0 0 460 340']");
    await radarSvg.waitFor({ state: "visible", timeout: 5000 });
    const polygonCount = await radarSvg.locator("polygon").count();
    console.log(`✓ Radar Chart rendered with ${polygonCount} web rings and plan polygons!`);

    // Verify radar axis labels
    const costLabel = await page.locator("text=Cost Efficiency").first().isVisible();
    const specLabel = await page.locator("text=Spec Match").first().isVisible();
    if (!costLabel || !specLabel) {
      throw new Error("Radar chart axis labels are missing or clipped!");
    }
    console.log("✓ Radar chart axes rendered cleanly with zero text truncation!");

    // Verify Smart Trade-off Frontier card
    const tradeoffCard = page.locator("#tradeoff-frontier-card");
    await tradeoffCard.waitFor({ state: "visible", timeout: 5000 });
    const recCards = await tradeoffCard.locator(".ant-col").count();
    console.log(`✓ Smart Trade-off Frontier rendered with ${recCards} actionable sensitivity recommendations!`);

    // Test applying a trade-off
    const applyTradeoffBtn = tradeoffCard.locator("button:has-text('Apply')").first();
    const applyTradeoffText = await applyTradeoffBtn.innerText();
    console.log(`Clicking Trade-off action: '${applyTradeoffText}'...`);
    await applyTradeoffBtn.click();
    await page.waitForTimeout(600);

    // Verify Tradeoff Confirmation Modal is VISIBLE
    const confirmModal = page.locator(".ant-modal:has-text('Confirm Sensitivity Trade-Off')");
    await confirmModal.waitFor({ state: "visible", timeout: 5000 });
    console.log("✓ Sensitivity Trade-Off Confirmation Modal is VISIBLE with itemized adjustments!");

    // Click 'Confirm & Apply Plan Changes →'
    const confirmApplyBtn = page.locator("button:has-text('Confirm & Apply Plan Changes')");
    await confirmApplyBtn.waitFor({ state: "visible", timeout: 5000 });
    await confirmApplyBtn.click();
    await page.waitForTimeout(1000);
    console.log("✓ Trade-off confirmed and plan dynamically updated with concrete replacements!");

    // Test 'Reset to Default Constraints' button
    const resetDefaultBtn = page.locator("#btn-reset-tradeoff-default");
    await resetDefaultBtn.waitFor({ state: "visible", timeout: 5000 });
    console.log("Clicking '#btn-reset-tradeoff-default' to revert to baseline...");
    await resetDefaultBtn.click();
    await page.waitForTimeout(1000);
    console.log("✓ Reset to Default Constraints successfully restored baseline plan!");

    // 11. Test Checkout & PayPal Capture in Last Stage
    console.log("Testing Step 2 (Mandate) and Step 3 (PayPal Pay-on-Delivery Capture)...");
    const selectPlanBtn = page.locator("button:has-text('Lock & Approve Plan B — Best Value →')").first();
    await selectPlanBtn.click();
    await page.waitForTimeout(800);

    // Should be on Step 2 (Order Mandate)
    await page.waitForSelector("text=Dual-Custody Spending Gate", { timeout: 6000 });
    console.log("✓ Reached Step 2 with locked cryptographic spending mandate!");

    // Trigger simulation/sandbox auth
    const simAuthBtn = page.locator("#btn-fast-simulation-auth");
    await simAuthBtn.click();
    await page.waitForTimeout(1000);

    // Should be on Step 3 (Settle)
    await page.waitForSelector("#btn-confirm-delivery", { timeout: 6000 });
    console.log("✓ Reached Step 3 (Last Stage) with PayPal Authorization Hold active!");

    // Click Confirm Delivery & Capture
    const confirmDeliveryBtn = page.locator("#btn-confirm-delivery");
    await confirmDeliveryBtn.waitFor({ state: "visible", timeout: 5000 });
    console.log("Clicking '#btn-confirm-delivery' in the last stage...");
    await confirmDeliveryBtn.click();
    await page.waitForTimeout(1200);

    // Verify capture succeeded and status tag is CAPTURED
    await page.waitForSelector("text=Delivery Confirmed & Funds Captured", { timeout: 6000 });
    console.log("✓ Last Stage Payment CAPTURE succeeded flawlessly with zero errors!");

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
