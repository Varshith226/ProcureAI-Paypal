"use strict";

/**
 * Money helpers.
 *
 * Policy: every amount is handled internally as an INTEGER number of paise
 * (1 INR = 100 paise), so sums never drift with floating-point error.
 * Inputs in rupees may have at most 2 decimal places. Outputs are converted
 * back to rupees; whole-rupee amounts come out as integers (e.g. 12499),
 * fractional amounts keep exactly 2 decimals (e.g. 12499.5).
 */

const MAX_RUPEES = 1e9; // sanity ceiling: ₹100 crore

class MoneyError extends Error {}

function isValidRupeeAmount(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return false;
  if (value < 0 || value > MAX_RUPEES) return false;
  const paise = Math.round(value * 100);
  return Math.abs(paise - value * 100) < 1e-6;
}

function toPaise(rupees) {
  if (!isValidRupeeAmount(rupees)) {
    throw new MoneyError(
      `Invalid rupee amount: ${rupees} (must be a finite, non-negative number with at most 2 decimals)`
    );
  }
  return Math.round(rupees * 100);
}

function toRupees(paise) {
  if (!Number.isSafeInteger(paise)) {
    throw new MoneyError(`Invalid paise amount: ${paise} (must be a safe integer)`);
  }
  return paise / 100;
}

/** Human-readable Indian-format rupee string, e.g. ₹1,23,456 or ₹99.50 */
function formatINR(paise) {
  const rupees = toRupees(paise);
  const hasFraction = paise % 100 !== 0;
  return (
    "₹" +
    rupees.toLocaleString("en-IN", {
      minimumFractionDigits: hasFraction ? 2 : 0,
      maximumFractionDigits: 2,
    })
  );
}

module.exports = { MoneyError, MAX_RUPEES, isValidRupeeAmount, toPaise, toRupees, formatINR };
