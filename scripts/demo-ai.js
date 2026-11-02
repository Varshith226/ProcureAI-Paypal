"use strict";

require("dotenv").config({ quiet: true });
const { createInterface } = require("node:readline/promises");
const { stdin, stdout } = require("node:process");
const { createAIService } = require("../src/aiService");
const sample = require("../examples/request-60k-setup.json");
const { clarificationTurn } = require("../src/requestUnderstanding");

async function main() {
  const api = createAIService();
  const args = process.argv.slice(2);
  const oneShot = args.includes("--sample");
  const terminal = createInterface({ input: stdin, output: stdout });
  try {
    const messages = [oneShot ? sample.rawQuery : await terminal.question("What do you need to buy? ")];
    let requestId;
    while (true) {
      const result = await api.parse({ messages, ...(requestId ? { requestId } : {}) });
      requestId = result.requestId;
      console.log(JSON.stringify(result, null, 2));
      if (result.status !== "NEEDS_CLARIFICATION" || oneShot) return;
      let answer;
      const question = result.questions[0];
      do {
        answer = await terminal.question(`${question.question} (or /quit): `);
      } while (!answer.trim());
      if (answer.trim() === "/quit") return;
      messages.push(clarificationTurn(question, answer));
    }
  } finally { terminal.close(); }
}

main().catch((error) => {
  console.error(`${error.code || "ERROR"}: ${error.message}`);
  process.exitCode = 1;
});
