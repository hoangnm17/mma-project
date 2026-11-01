import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { createApp } from "../../src/app.js";
import { config } from "../../src/config.js";
import { database, closeDatabase } from "../../src/db.js";

test("All three AI POST methods use Gemini; provider failures preserve staff sessions", async () => {
  assert.match(config.mongo.database, /^StayFlow_\d+Test$/);
  const savedFetch = globalThis.fetch;
  const keys = ["AI_PROVIDER", "GEMINI_API_KEY", "GEMINI_MODEL"];
  const saved = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  try {
    process.env.AI_PROVIDER = "gemini";
    process.env.GEMINI_API_KEY = "http-test-only-key";
    process.env.GEMINI_MODEL = "gemini-3.5-flash-lite";
    const app = createApp();
    const login = await request(app).post("/api/auth/login").send({ username: "admin", password: process.env.DEMO_SEED_PASSWORD });
    assert.equal(login.status, 200);
    const ctx = await database();
    const action = (name, body) => request(app).post("/api/actions/" + name).set("Authorization", "Bearer " + login.body.token).set("Idempotency-Key", randomUUID()).send(body);
    const type = await ctx.db.collection("RoomTypes").findOne({});
    const customer = await ctx.db.collection("Customers").findOne({});
    const room = await action("room", { number: "ZAI-" + randomUUID().slice(0, 8), typeId: type.id, zone: "TEST" });
    assert.equal(room.status, 200);
    const checkin = await action("checkin", { roomId: room.body.id, customerId: customer.id, guests: 1, mode: "HOUR" });
    assert.equal(checkin.status, 200);
    const stay = checkin.body;
    const cases = [
      ["draft", { stayId: stay.id, text: "Tôi muốn thêm khăn" }, { serviceCode: "TOWELS", checklist: [], requestedDate: null, windowStart: null, windowEnd: null, clarificationNeeded: true, clarificationQuestion: "Bạn muốn nhận khăn lúc nào?" }],
      ["manager", { question: "Có bao nhiêu phòng?" }, { tool: "dashboard", start: null, end: null, question: null }],
      ["marketing", { brief: "Viết lời cảm ơn khách hàng" }, { draft: "Cảm ơn quý khách đã lưu trú." }],
    ];
    const post = (name, body) => request(app).post("/api/ai/" + name).set("Authorization", "Bearer " + login.body.token).send(body);
    const taskCount = await ctx.db.collection("HousekeepingTasks").countDocuments({ stayId: stay.id });
    for (const [name, body, output] of cases) {
      globalThis.fetch = async (url, options) => {
        assert.match(url, /:generateContent$/);
        assert.equal(options.method, "POST");
        assert.equal(Object.hasOwn(JSON.parse(options.body), "store"), false);
        return { ok: true, json: async () => ({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify(output) }] } }] }) };
      };
      const response = await post(name, body);
      assert.equal(response.status, 200, JSON.stringify(response.body));
      if (name === "draft") assert.equal(response.body.requiresConfirmation, true);
      if (name === "marketing") assert.equal(response.body.requiresApproval, true);
      for (const [status, code] of [[400, "AI_PROVIDER_REQUEST"], [401, "AI_PROVIDER_AUTH"], [403, "AI_PROVIDER_AUTH"], [404, "AI_PROVIDER_MODEL"], [429, "AI_PROVIDER_QUOTA"], [500, "AI_PROVIDER_UNAVAILABLE"]]) {
        globalThis.fetch = async () => ({ ok: false, status, json: () => { throw Error("Never expose provider body"); } });
        const failure = await post(name, body);
        assert.equal(failure.status, 503);
        assert.equal(failure.body.code, code);
        assert.equal(failure.body.providerStatus, status);
        assert.ok(!JSON.stringify(failure.body).includes(process.env.GEMINI_API_KEY));
      }
    }
    assert.equal(await ctx.db.collection("HousekeepingTasks").countDocuments({ stayId: stay.id }), taskCount);
    assert.equal((await request(app).get("/api/me").set("Authorization", "Bearer " + login.body.token)).status, 200);
  } finally {
    globalThis.fetch = savedFetch;
    for (const key of keys) { if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key]; }
    await closeDatabase();
  }
});
