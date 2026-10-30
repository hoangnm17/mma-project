import { writeFile, mkdir } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { cleaningDraft } from "../src/services/ai.js";
import { aiCases, referenceTime } from "../test/fixtures/ai-cases.js";
if (!process.env.OPENAI_API_KEY) {
  console.error(
    "BLOCKED: thiếu OPENAI_API_KEY. Không chạy đánh giá AI thật. Bộ dữ liệu có " +
      aiCases.length +
      " câu.",
  );
  process.exit(2);
}
const results = [];
for (const sample of aiCases) {
  const start = performance.now();
  try {
    const draft = await cleaningDraft(sample.text, new Date(referenceTime));
    const e = sample.expected;
    results.push({
      text: sample.text,
      expected: e,
      draft,
      latencyMs: Math.round(performance.now() - start),
      codeCorrect: !e.serviceCode || draft.serviceCode === e.serviceCode,
      clarificationCorrect: draft.clarificationNeeded === e.clarificationNeeded,
      timeCorrect:
        !e.windowStart ||
        (new Date(draft.windowStart).getTime() ===
          new Date(e.windowStart).getTime() &&
          new Date(draft.windowEnd).getTime() ===
            new Date(e.windowEnd).getTime()),
    });
  } catch (error) {
    results.push({
      text: sample.text,
      error: error.message,
      latencyMs: Math.round(performance.now() - start),
    });
  }
}
const latency = results.map((r) => r.latencyMs).sort((a, b) => a - b);
const report = {
  model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
  referenceTime,
  count: results.length,
  serviceAccuracy: results.filter((r) => r.codeCorrect).length / results.length,
  clarificationAccuracy:
    results.filter((r) => r.clarificationCorrect).length / results.length,
  timeAccuracy: results.filter((r) => r.timeCorrect).length / results.length,
  p95LatencyMs: latency[Math.ceil(latency.length * 0.95) - 1],
  results,
};
await mkdir("../artifacts", { recursive: true });
await writeFile(
  "../artifacts/ai-evaluation.json",
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify({ ...report, results: undefined }, null, 2));
