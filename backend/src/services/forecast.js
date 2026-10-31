import { query } from "../db.js";
export function weeklyForecast(series, horizon = 7) {
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
    return Math.max(
      0,
      Math.round(
        matching.reduce((sum, s) => sum + s[key], 0) / matching.length,
      ),
    );
  };
  let revenueError = 0,
    demandError = 0;
  for (let i = series.length - 14; i < series.length; i++) {
    const row = series[i],
      date = new Date(row.date);
    revenueError += Math.abs(
      predict(series.slice(0, i), date, "revenue") - row.revenue,
    );
    demandError += Math.abs(
      predict(series.slice(0, i), date, "demand") - row.demand,
    );
  }
  const last = new Date(series.at(-1).date);
  const days = Array.from({ length: horizon }, (_, i) => {
    const date = new Date(last.getTime() + (i + 1) * 86400000);
    return {
      date: date.toISOString().slice(0, 10),
      revenue: predict(series, date, "revenue"),
      demand: predict(series, date, "demand"),
    };
  });
  return {
    available: true,
    model: "weekday-mean-v1",
    simulated: false,
    historyDays: series.length,
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
  return weeklyForecast(series, horizon);
}
