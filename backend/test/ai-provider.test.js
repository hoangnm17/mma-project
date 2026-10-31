import test from "node:test";
import assert from "node:assert/strict";
import { providerStructured, aiConfiguration, aiConfigured } from "../src/services/ai-provider.js";
import { cleaningDraft } from "../src/services/ai.js";

async function withConfig(values, work) {
  const keys = ["AI_PROVIDER", "GEMINI_API_KEY", "OPENAI_API_KEY", "GEMINI_MODEL", "OPENAI_MODEL"];
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  for (const key of keys) { if (values[key] === undefined) delete process.env[key]; else process.env[key] = values[key]; }
  try { await work(); } finally {
    for (const key of keys) { if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key]; }
  }
}
const schema = { type: "object", additionalProperties: false, properties: { ok: { type: "boolean" } }, required: ["ok"] };
const response = (text, finishReason = "STOP") => ({ ok: true, json: async () => ({ candidates: [{ finishReason, content: { parts: [{ text }] } }] }) });

test("Gemini uses a header key, JSON Schema and bounded server-side output", () => withConfig({ GEMINI_API_KEY: "unit-gemini-key" }, async () => {
  assert.equal(aiConfiguration().provider, "gemini");
  const result = await providerStructured("Extract data", "An ordinary test", schema, "test", async (url, options) => {
    assert.equal(url, "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent");
    assert.ok(!url.includes("unit-gemini-key"));
    assert.equal(options.headers["x-goog-api-key"], "unit-gemini-key");
    assert.equal(options.headers.Authorization, undefined);
    const body = JSON.parse(options.body);
    assert.equal(body.store, false);
    assert.equal(body.generationConfig.maxOutputTokens, 900);
    assert.deepEqual(body.generationConfig.responseJsonSchema, schema);
    return response('{"ok":true}');
  });
  assert.deepEqual(result, { ok: true });
}));

test("An explicit provider never silently sends prompts to another provider", () => withConfig({ AI_PROVIDER: "openai", GEMINI_API_KEY: "unit-gemini-key" }, async () => {
  assert.equal(aiConfigured(), false);
  await assert.rejects(() => providerStructured("test", "test", schema, "test", async () => { throw Error("Must not fetch"); }), error => error.status === 503);
}));

test("Provider 401/quota failures never log out staff or echo credentials", () => withConfig({ GEMINI_API_KEY: "unit-gemini-key" }, async () => {
  for (const status of [401, 403, 429, 500]) await assert.rejects(
    () => providerStructured("test", "test", schema, "test", async () => ({ ok: false, status,
      json: async () => { throw Error("Provider error body must never be read"); } })),
    error => error.status === 503 && !error.message.includes("unit-gemini-key"));
}));

test("Gemini rejects blocked, truncated or invalid JSON results", () => withConfig({ GEMINI_API_KEY: "unit-gemini-key" }, async () => {
  for (const candidate of [response('{"ok":true}', "MAX_TOKENS"), response("not-json"), response("null"), response("[]"), { ok: true, json: async () => ({ promptFeedback: { blockReason: "SAFETY" } }) }]) {
    await assert.rejects(() => providerStructured("test", "test", schema, "test", async () => candidate), error => error.status === 503);
  }
}));

test("Gemini drafts still require confirmation and sanitize checklist items", () => withConfig({ GEMINI_API_KEY: "unit-gemini-key" }, async () => {
  const draft = await cleaningDraft("Thay khăn chiều nay", new Date("2026-10-31T01:00:00Z"), async () => response(JSON.stringify({
    serviceCode: "TOWELS", checklist: ["arbitrary item"], requestedDate: "2026-10-31", windowStart: "2026-10-31T15:00:00+07:00",
    windowEnd: "2026-10-31T16:00:00+07:00", clarificationNeeded: false, clarificationQuestion: null,
  })));
  assert.equal(draft.provider, "gemini");
  assert.equal(draft.requiresConfirmation, true);
  assert.ok(!draft.checklist.includes("arbitrary item"));
}));
