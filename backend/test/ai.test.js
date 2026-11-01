import test, { beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { cleaningDraft } from "../src/services/ai.js";
import { weeklyForecast } from "../src/services/forecast.js";
let providerEnvironment;
beforeEach(() => {
  providerEnvironment = { AI_PROVIDER: process.env.AI_PROVIDER, GEMINI_API_KEY: process.env.GEMINI_API_KEY };
  process.env.AI_PROVIDER = "openai";
  delete process.env.GEMINI_API_KEY;
});
afterEach(() => {
  for (const [key, value] of Object.entries(providerEnvironment)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});
test("AI chưa có key báo fallback, không giả kết quả", async () => {
  const original = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  try {
    await assert.rejects(
      () => cleaningDraft("Dọn phòng"),
      (e) => e.status === 503,
    );
  } finally {
    if (original) process.env.OPENAI_API_KEY = original;
  }
});
test("AI schema thật qua HTTP adapter mock, thời gian Việt Nam", async () => {
  const original = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "unit-test-only";
  try {
    const data = {
      serviceCode: "FULL",
      checklist: ["thay ga"],
      requestedDate: "2026-10-29",
      windowStart: "2026-10-29T15:00:00+07:00",
      windowEnd: "2026-10-29T16:00:00+07:00",
      clarificationNeeded: false,
      clarificationQuestion: null,
    };
    const result = await cleaningDraft(
      "Chiều nay 3 giờ dọn và thay ga, xong trước 4 giờ",
      new Date("2026-10-29T01:00:00Z"),
      async (url, options) => {
        assert.equal(url, "https://api.openai.com/v1/responses");
        const body = JSON.parse(options.body);
        assert.equal(body.text.format.strict, true);
        assert.equal(body.store, false);
        assert(!options.body.includes('roomId":"'));
        return {
          ok: true,
          json: async () => ({
            output: [
              {
                content: [{ type: "output_text", text: JSON.stringify(data) }],
              },
            ],
          }),
        };
      },
    );
    assert.equal(result.requiresConfirmation, true);
    assert.equal(result.serviceCode, "FULL");
    assert(result.checklist.includes("Thay ga giường"));
  } finally {
    if (original) process.env.OPENAI_API_KEY = original;
    else delete process.env.OPENAI_API_KEY;
  }
});
test("AI timeout và JSON sai đều fallback", async () => {
  const original = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "unit-test-only";
  try {
    await assert.rejects(
      () =>
        cleaningDraft("Dọn phòng", new Date(), async () => {
          throw Error("Timeout");
        }),
      (e) => e.status === 503,
    );
    await assert.rejects(
      () =>
        cleaningDraft("Dọn phòng", new Date(), async () => ({
          ok: true,
          json: async () => ({
            output: [{ content: [{ type: "output_text", text: "not json" }] }],
          }),
        })),
      (e) => e.status === 503,
    );
  } finally {
    if (original) process.env.OPENAI_API_KEY = original;
    else delete process.env.OPENAI_API_KEY;
  }
});
test("Forecast từ chối thiếu lịch sử và backtest chỉ nhìn quá khứ", () => {
  assert.equal(weeklyForecast([]).available, false);
  const series = Array.from({ length: 70 }, (_, i) => {
    const date = new Date(Date.UTC(2026, 0, 1 + i));
    return {
      date: date.toISOString().slice(0, 10),
      revenue: date.getUTCDay() * 100000,
      demand: date.getUTCDay(),
    };
  });
  const f = weeklyForecast(series, 30);
  assert.equal(f.days.length, 30);
  assert.equal(f.backtest.revenueMAE, 0);
  assert.equal(f.backtest.demandMAE, 0);
  assert.equal(f.days[0].date, "2026-03-12");
});

test("Forecast follows weekly trends, widens reference ranges and handles zero demand", () => {
  const series = Array.from({ length: 70 }, (_, i) => ({
    date: new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10),
    revenue: 100000 + i * 2000,
    demand: 10 + Math.floor(i / 7),
  }));
  const result = weeklyForecast(series, 30);
  assert.equal(result.model, "weekday-trend-v2");
  assert(result.days[0].revenue > series.at(-1).revenue);
  assert.equal(result.backtest.revenueMAE, 0);
  assert(result.summary.revenueChangePercent > 0);
  assert.equal(result.summary.totalDemand, result.days.reduce((sum, day) => sum + day.demand, 0));
  for (const day of result.days) {
    assert(day.revenueRange.low <= day.revenue && day.revenueRange.high >= day.revenue);
    assert(day.demandRange.low >= 0 && day.demandRange.high >= day.demand);
  }
  const zero = weeklyForecast(series.map(row => ({ ...row, revenue: 0, demand: 0 })), 7);
  assert.equal(zero.summary.totalRevenue, 0);
  assert.equal(zero.summary.revenueChangePercent, null);
  assert(zero.days.every(day => Number.isFinite(day.revenue) && day.revenueRange.low === 0));
  assert.throws(() => weeklyForecast(series, 14), error => error.status === 400);
});
