"use strict";

/**
 * Rate Limiter for AI and public-facing sensitive endpoints.
 *
 * Rules:
 *  - Per IP: 20 requests/minute
 *  - Per IP: 250 requests/day
 *  - Global daily AI ceiling: when reached, seamlessly switches AI into heuristic mode
 *    rather than failing users with 429 errors.
 */

const minuteWindows = new Map(); // ip -> Array of timestamps
const dailyWindows = new Map();  // ip -> Array of timestamps

let globalDailyAICalls = 0;
let lastGlobalReset = Date.now();
const GLOBAL_DAILY_AI_CEILING = Number(process.env.GLOBAL_DAILY_AI_CEILING) || 1000;

function cleanOldTimestamps(arr, windowMs, now) {
  const cutoff = now - windowMs;
  return arr.filter((ts) => ts > cutoff);
}

function resetGlobalDailyIfExpired(now) {
  if (now - lastGlobalReset > 24 * 60 * 60 * 1000) {
    globalDailyAICalls = 0;
    lastGlobalReset = now;
  }
}

function recordGlobalAICall() {
  const now = Date.now();
  resetGlobalDailyIfExpired(now);
  globalDailyAICalls++;
}

function isGlobalAICeilingReached() {
  const now = Date.now();
  resetGlobalDailyIfExpired(now);
  return globalDailyAICalls >= GLOBAL_DAILY_AI_CEILING;
}

function getGlobalAICallCount() {
  resetGlobalDailyIfExpired(Date.now());
  return globalDailyAICalls;
}

/**
 * Express middleware for AI endpoint rate limiting.
 */
function aiRateLimiter(req, res, next) {
  const ip = req.ip || req.connection?.remoteAddress || "127.0.0.1";
  const now = Date.now();

  let minList = cleanOldTimestamps(minuteWindows.get(ip) || [], 60 * 1000, now);
  let dayList = cleanOldTimestamps(dailyWindows.get(ip) || [], 24 * 60 * 60 * 1000, now);

  const MINUTE_LIMIT = Number(process.env.RATE_LIMIT_AI_PER_MIN) || 20;
  const DAILY_LIMIT = Number(process.env.RATE_LIMIT_AI_PER_DAY) || 250;

  if (minList.length >= MINUTE_LIMIT) {
    const oldestInWindow = minList[0];
    const retryAfter = Math.max(1, Math.ceil((oldestInWindow + 60 * 1000 - now) / 1000));
    res.set("Retry-After", String(retryAfter));
    return res.status(429).json({
      error: "RATE_LIMIT_EXCEEDED",
      code: "AI_MINUTE_LIMIT_REACHED",
      message: "AI prompt rate limit reached (20/min). Please pause for a few seconds before generating more plans.",
      retryAfterSeconds: retryAfter,
    });
  }

  if (dayList.length >= DAILY_LIMIT) {
    res.set("Retry-After", "3600");
    return res.status(429).json({
      error: "RATE_LIMIT_EXCEEDED",
      code: "AI_DAILY_LIMIT_REACHED",
      message: "Daily AI generation limit reached for this IP. Procurement planning remains accessible via default catalog templates.",
      retryAfterSeconds: 3600,
    });
  }

  minList.push(now);
  dayList.push(now);
  minuteWindows.set(ip, minList);
  dailyWindows.set(ip, dayList);

  recordGlobalAICall();
  next();
}

/**
 * Resets in-memory tracking (useful for unit tests)
 */
function resetRateLimits() {
  minuteWindows.clear();
  dailyWindows.clear();
  globalDailyAICalls = 0;
  lastGlobalReset = Date.now();
}

module.exports = {
  aiRateLimiter,
  recordGlobalAICall,
  isGlobalAICeilingReached,
  getGlobalAICallCount,
  resetRateLimits,
};

