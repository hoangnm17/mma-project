import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { config } from "../../src/config.js";
import { database, closeDatabase } from "../../src/db.js";
import { insert } from "../../src/mongo-store.js";
import { normalizePhone } from "../../src/domain.js";
import { seedHistory } from "../../scripts/seed-history.js";
import { forecast } from "../../src/services/forecast.js";
import { dashboardReport } from "../../src/services/reporting.js";
import { createApp } from "../../src/app.js";

test("60-day history preserves existing data, resumes atomically and feeds forecast/AI over HTTP", async () => {
  const name = `StayFlow_${Date.now()}HistoryTest`;
  assert.match(name, /^StayFlow_\d+HistoryTest$/);
  config.mongo.database = name;
  const env = { ...process.env, MONGO_DATABASE: name, DEMO_SEED_PASSWORD: "HistoryTestOnly!2026" };
  const originalFetch = globalThis.fetch;
  const oldProvider = Object.fromEntries(["AI_PROVIDER", "GEMINI_API_KEY", "GEMINI_MODEL"].map(key => [key, process.env[key]]));
  let ctx;
  try {
    for (const script of ["migrate.js", "seed-demo.js"]) {
      const run = spawnSync(process.execPath, ["scripts/" + script], { env, encoding: "utf8", windowsHide: true });
      assert.equal(run.status, 0, run.stdout + run.stderr);
    }
    ctx = await database();
    const rooms = await ctx.db.collection("Rooms").find().sort({ number: 1 }).toArray();
    const type = await ctx.db.collection("RoomTypes").findOne({ id: rooms.at(-1).typeId });
    const customer = await ctx.db.collection("Customers").findOne({});
    const end = new Date(new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10) + "T00:00:00+07:00");
    const preservedStay = { id: randomUUID(), roomId: rooms.at(-1).id, customerId: customer.id,
      startedAt: new Date(end - 62 * 86400000), expectedEnd: end, endedAt: end,
      mode: "NIGHT", status: "CLOSED", guests: 1, cycle: 1, rateJson: type.rateJson };
    await insert(ctx, "Stays", preservedStay);
    await insert(ctx, "Customers", { id: randomUUID(), name: "Existing formatted phone", phone: "+84 998000000" });
    const original = {};
    for (const { name } of await ctx.db.listCollections().toArray()) {
      if (name !== "PropertyMutex") original[name] = await ctx.db.collection(name).find().toArray();
    }
    await assert.rejects(seedHistory({ onProgress: ({ day }) => { if (day === 2) throw Error("simulated interruption"); } }), /simulated interruption/);
    assert.equal(await ctx.db.collection("AuditLogs").countDocuments({ action: /^demo\.history\.60d\.v1\.day\./ }), 2);
    const result = await seedHistory();
    assert.equal(result.days, 60);
    assert(result.stays > 300);
    assert.equal(await ctx.db.collection("AuditLogs").countDocuments({ action: /^demo\.history\.60d\.v1\.day\./ }), 60);
    const demoStays = await ctx.db.collection("Stays").find({ source: "Demo 60 ngày" }).toArray();
    assert.equal(demoStays.length, result.stays);
    assert(demoStays.every(stay => stay.status === "CLOSED" && stay.endedAt <= end && stay.startedAt < stay.endedAt));
    assert(demoStays.every(stay => stay.roomId !== preservedStay.roomId));
    for (const room of rooms) {
      const timeline = demoStays.filter(stay => stay.roomId === room.id).sort((a, b) => a.startedAt - b.startedAt);
      for (let i = 1; i < timeline.length; i++) assert(timeline[i].startedAt >= timeline[i - 1].endedAt);
    }
    const phones = (await ctx.db.collection("Customers").find().toArray()).map(customer => normalizePhone(customer.phone));
    assert.equal(new Set(phones).size, phones.length);
    for (const [name, docs] of Object.entries(original)) {
      for (const doc of docs) assert.deepEqual(await ctx.db.collection(name).findOne({ _id: doc._id }), doc, name);
    }
    const invoiceRows = await ctx.db.collection("Invoices").find({ stayId: { $in: demoStays.map(stay => stay.id) } }).toArray();
    assert.equal(new Set(invoiceRows.map(row => new Date(row.createdAt.getTime() + 7 * 3600000).toISOString().slice(0, 10))).size, 60);
    for (const invoice of invoiceRows) {
      const lines = await ctx.db.collection("InvoiceLines").find({ invoiceId: invoice.id }).toArray();
      const allocations = await ctx.db.collection("PaymentAllocations").find({ invoiceId: invoice.id }).toArray();
      const receipts = await ctx.db.collection("Receipts").find({ stayId: invoice.stayId }).toArray();
      assert.equal(lines.reduce((sum, line) => sum + line.total, 0), invoice.total);
      assert.equal(allocations.reduce((sum, row) => sum + row.amount, 0), receipts.reduce((sum, row) => sum + row.amount, 0));
    }
    const beforeRetry = await ctx.db.collection("Invoices").countDocuments();
    assert.equal((await seedHistory()).skipped, true);
    assert.equal(await ctx.db.collection("Invoices").countDocuments(), beforeRetry);
    const report = await dashboardReport(ctx);
    assert.equal(report.containsDemoData, true);
    for (const category of ["ROOM", "SERVICE", "FOOD", "SPECIAL"]) assert(report.report.bySource[category] > 0);
    const prediction = await forecast(ctx, 30);
    assert.equal(prediction.available, true);
    assert.equal(prediction.simulated, true);
    assert(prediction.historyDays >= 60);
    assert.equal(prediction.days.length, 30);
    const app = createApp();
    const login = await request(app).post("/api/auth/login").send({ username: "admin", password: env.DEMO_SEED_PASSWORD });
    assert.equal(login.status, 200);
    const get = resource => request(app).get("/api/" + resource).set("Authorization", "Bearer " + login.body.token);
    assert.equal((await get("forecast?days=30")).body.simulated, true);
    assert.equal((await get("forecast?days=10")).status, 400);
    process.env.AI_PROVIDER = "gemini";
    process.env.GEMINI_API_KEY = "history-test-only";
    process.env.GEMINI_MODEL = "gemini-3.5-flash-lite";
    globalThis.fetch = async (url, options) => {
      const body = JSON.parse(options.body);
      assert(body.generationConfig.responseJsonSchema.properties.tool.enum.includes("forecast"));
      return { ok: true, json: async () => ({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify({ tool: "forecast", days: 30, start: null, end: null, question: null }) }] } }] }) };
    };
    const answer = await request(app).post("/api/ai/manager").set("Authorization", "Bearer " + login.body.token).send({ question: "Dự báo doanh thu và nhu cầu 30 ngày tới?" });
    assert.equal(answer.status, 200, JSON.stringify(answer.body));
    assert.equal(answer.body.tool, "forecast");
    assert.equal(answer.body.data.days.length, 30);
    assert.match(answer.body.message, /dữ liệu demo/);
    assert.equal(await ctx.db.collection("Invoices").countDocuments(), beforeRetry);
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries(oldProvider)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    if (ctx) await ctx.db.dropDatabase();
    await closeDatabase();
  }
});
