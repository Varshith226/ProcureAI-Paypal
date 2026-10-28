"use strict";

const { AIServiceError } = require("./aiErrors");
const { setTimeout: delay } = require("node:timers/promises");
const { GEMINI_EXTRACTION_SCHEMA, SYSTEM_INSTRUCTION } = require("./requestExtraction");

const DEFAULT_MODEL = "gemini-3.5-flash-lite";
const RETRY_DELAYS_MS = [2000, 4000, 8000];

function createGeminiExtractor({
  apiKey = process.env.GEMINI_API_KEY,
  model = process.env.GEMINI_MODEL || DEFAULT_MODEL,
  fetchImpl = globalThis.fetch,
  timeoutMs = 30000,
  waitImpl = (ms, signal) => delay(ms, undefined, { signal }),
} = {}) {
  return async function extract(messages) {
    if (!apiKey || apiKey === "your-gemini-api-key") {
      throw new AIServiceError("AI_NOT_CONFIGURED", "Set GEMINI_API_KEY in the server's local .env, then restart the server.", 503);
    }
    if (!/^[a-zA-Z0-9._-]+$/.test(model)) {
      throw new AIServiceError("AI_NOT_CONFIGURED", "GEMINI_MODEL must be a Gemini model ID.", 503);
    }
    // The key stays in a header, never in a logged URL or a browser bundle.
    // One total deadline covers every attempt and backoff wait. Only an explicit
    // HTTP 503 is retried, at most three times; other failures return immediately.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
      const request = {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        signal: controller.signal,
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
          contents: [{ role: "user", parts: [{ text: JSON.stringify({ userMessages: messages }) }] }],
          generationConfig: { responseMimeType: "application/json", responseJsonSchema: GEMINI_EXTRACTION_SCHEMA, maxOutputTokens: 8192 },
        }),
      };
      let response;
      for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
        response = await fetchImpl(url, request);
        if (response.status !== 503) break;
        // Release the failed response before waiting, without logging its body.
        await response.body?.cancel();
        if (attempt === RETRY_DELAYS_MS.length) {
          throw new AIServiceError("AI_OVERLOADED", "Gemini is temporarily overloaded after three retries. Please try again later.", 503);
        }
        await waitImpl(RETRY_DELAYS_MS[attempt], controller.signal);
      }
      if (!response.ok) {
        // Do not return provider bodies (they can contain input or secrets).
        throw new AIServiceError(
          response.status === 429 ? "AI_RATE_LIMITED" : "AI_PROVIDER_ERROR",
          response.status === 429 ? "AI quota or rate limit reached. Try again later or check your Gemini quota." : "Gemini rejected the request. Check the server's API key, model access and configuration.",
          response.status === 429 ? 429 : 502,
        );
      }
      let data;
      try { data = await response.json(); } catch {
        throw new AIServiceError("AI_INVALID_OUTPUT", "Gemini returned an unreadable response. Try again.");
      }
      const candidate = data?.candidates?.[0];
      if (candidate?.finishReason !== "STOP") {
        throw new AIServiceError("AI_INVALID_OUTPUT", "Gemini did not complete the extraction. Try a shorter purchasing request.");
      }
      const output = candidate.content?.parts?.filter((part) => !part.thought).map((part) => part.text || "").join("");
      try { return JSON.parse(output); } catch {
        throw new AIServiceError("AI_INVALID_OUTPUT", "Gemini did not return valid requirement JSON. Try again.");
      }
    } catch (error) {
      if (error instanceof AIServiceError) throw error;
      if (controller.signal.aborted) throw new AIServiceError("AI_TIMEOUT", "Gemini timed out. Please try again.", 504);
      throw new AIServiceError("AI_UNAVAILABLE", "Could not reach Gemini. Please try again later.", 503);
    } finally {
      clearTimeout(timer);
    }
  };
}

module.exports = { createGeminiExtractor, DEFAULT_MODEL };
