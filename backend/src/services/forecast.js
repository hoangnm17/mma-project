import { query } from "../db.js";
import { first as findFirst } from "../mongo-store.js";
import { assert } from "../domain.js";
export function weeklyForecast(series, horizon = 7) {
  assert([7, 30].includes(horizon), "Chỉ hỗ trợ dự báo 7 hoặc 30 ngày", 400);
  if (series.length < 56)
    return {
      available: false,
      message: "Chưa đủ dữ liệu: cần ít nhất 56 ngày lịch sử thực.",
      days: [],
    };
  const predict = (history, date, key) => {
    const matching = history
      .slice(-56)
      .filter((s) => new Date(s.date).getUTCDay() === date.getUTCDay());
    const mean = matching.reduce((sum, row) => sum + row[key], 0) / matching.length;
    const center = (matching.length - 1) / 2;
    const variance = matching.reduce((sum, row, index) => sum + (index - center) ** 2, 0);
    const slope = variance ? matching.reduce((sum, row, index) => sum + (index - center) * (row[key] - mean), 0) / variance : 0;
    // Fit each weekday separately; cap extrapolation so short bursts cannot grow
    // into unbounded 30-day estimates. Backtesting uses only earlier observations.
    const boundedSlope = Math.max(-mean * 0.25, Math.min(mean * 0.25, slope));
    const weeks = (date - new Date(matching[0].date)) / (7 * 86400000);
    return Math.max(0, Math.round(Math.min(mean * 2, mean + boundedSlope * (weeks - center))));
  };
  let revenueError = 0,
    demandError = 0;
  const errors = { revenue: [], demand: [] };
  for (let i = series.length - 14; i < series.length; i++) {
    const row = series[i],
      date = new Date(row.date);
    const revenueResidual = Math.abs(predict(series.slice(0, i), date, "revenue") - row.revenue);
    const demandResidual = Math.abs(predict(series.slice(0, i), date, "demand") - row.demand);
    errors.revenue.push(revenueResidual);
    errors.demand.push(demandResidual);
    revenueError += revenueResidual;
    demandError += demandResidual;
  }
  const interval = (value, key, index) => {
    const sorted = [...errors[key]].sort((a, b) => a - b);
    const margin = Math.ceil(Math.max(sorted[Math.ceil(sorted.length * 0.9) - 1], value * 0.05, key === "demand" ? 1 : 0) * Math.sqrt(1 + index / 7));
    return { low: Math.max(0, value - margin), high: value + margin };
  };
  const last = new Date(series.at(-1).date);
  const days = Array.from({ length: horizon }, (_, i) => {
    const date = new Date(last.getTime() + (i + 1) * 86400000);
    const revenue = predict(series, date, "revenue"), demand = predict(series, date, "demand");
    return {
      date: date.toISOString().slice(0, 10),
      revenue, demand,
      revenueRange: interval(revenue, "revenue", i),
      demandRange: interval(demand, "demand", i),
    };
  });
  const totalRevenue = days.reduce((sum, row) => sum + row.revenue, 0);
  const totalDemand = days.reduce((sum, row) => sum + row.demand, 0);
  const previous = series.slice(-horizon);
  const change = (total, key) => {
    const mean = previous.reduce((sum, row) => sum + row[key], 0) / previous.length;
    return mean ? Number(((total / horizon / mean - 1) * 100).toFixed(1)) : null;
  };
  return {
    available: true,
    model: "weekday-trend-v2",
    simulated: false,
    historyDays: series.length,
    lastObservedDate: series.at(-1).date,
    intervalMethod: "Sai số tuyệt đối phân vị 90% trên 14 ngày kiểm thử, mở rộng theo thời hạn; khoảng tham khảo, không phải xác suất bảo đảm.",
    summary: { totalRevenue, totalDemand, averageDailyRevenue: Math.round(totalRevenue / horizon),
      revenueChangePercent: change(totalRevenue, "revenue"), demandChangePercent: change(totalDemand, "demand"),
      peakDate: [...days].sort((a, b) => b.demand - a.demand || b.revenue - a.revenue)[0].date },
    backtest: {
      days: 14,
      revenueMAE: Math.round(revenueError / 14),
      demandMAE: Number((demandError / 14).toFixed(2)),
    },
    days,
  };
}
export async function forecast(db, horizon) {
  const invoices = await query(db, "revenueByDay");
  if (!invoices.length) return weeklyForecast([], horizon);
  const demand = await query(db, "demandByDay");
  const adjusted = await query(db, "adjustmentsByDay");
  const start = new Date(invoices.map((r) => r.date).sort()[0]);
  const end = new Date(
    new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10),
  );
  const count = Math.min(180, Math.floor((end - start) / 86400000));
  const first = new Date(end.getTime() - count * 86400000);
  const series = Array.from({ length: count }, (_, i) => {
    const date = new Date(first.getTime() + i * 86400000)
      .toISOString()
      .slice(0, 10);
    return {
      date,
      revenue:
        (invoices.find((r) => r.date === date)?.revenue || 0) -
        (adjusted.find((r) => r.date === date)?.amount || 0),
      demand: demand.find((r) => r.date === date)?.demand || 0,
    };
  });
  const result = weeklyForecast(series, horizon);
  const demo = await findFirst(db, "Stays", { source: "Demo 60 ngày", startedAt: { $lt: end }, endedAt: { $gte: first } });
  return { ...result, simulated: Boolean(demo) };
}
