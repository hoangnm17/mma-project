import { z } from "zod";
import { assert } from "../domain.js";
import { find, sum } from "../mongo-store.js";

const sources = ["ROOM", "SERVICE", "FOOD", "SPECIAL"];
export function reportRange(params = {}) {
  assert(Boolean(params.from) === Boolean(params.to), "Cần chọn đủ thời điểm bắt đầu và kết thúc", 400);
  if (!params.from) return {};
  const from = new Date(z.string().datetime({ offset: true }).parse(params.from));
  const to = new Date(z.string().datetime({ offset: true }).parse(params.to));
  assert(to > from, "Khoảng thời gian báo cáo không hợp lệ", 400);
  return { from, to };
}

// Allocate discounts, final price changes and refunds proportionately to the
// immutable invoice lines. Largest remainders keep whole-VND sums exact.
export function revenueSources(lines, total) {
  assert(Number.isSafeInteger(total) && total >= 0, "Tổng doanh thu không hợp lệ", 400);
  const gross = Object.fromEntries(sources.map((key) => [key, 0]));
  for (const line of lines) {
    assert(Number.isSafeInteger(line.total) && line.total >= 0, "Chi tiết doanh thu không hợp lệ", 400);
    const category = sources.includes(line.category) ? line.category :
      /^Tiền phòng/.test(line.name) ? "ROOM" : "SERVICE";
    gross[category] += line.total;
    assert(Number.isSafeInteger(gross[category]), "Chi tiết doanh thu vượt giới hạn", 400);
  }
  const denominator = Object.values(gross).reduce((a, b) => a + b, 0);
  if (!denominator) return { ROOM: total, SERVICE: 0, FOOD: 0, SPECIAL: 0 };
  assert(Number.isSafeInteger(denominator), "Chi tiết doanh thu vượt giới hạn", 400);
  const divisor = BigInt(denominator);
  const shares = sources.map((key) => {
    const numerator = BigInt(total) * BigInt(gross[key]);
    return { key, whole: Number(numerator / divisor), remainder: numerator % divisor };
  });
  const result = Object.fromEntries(shares.map(({ key, whole }) => [key, whole]));
  let remaining = total - Object.values(result).reduce((a, b) => a + b, 0);
  for (const { key } of shares.sort((a, b) => a.remainder === b.remainder ? 0 : a.remainder > b.remainder ? -1 : 1)) {
    if (remaining-- <= 0) break;
    result[key]++;
  }
  return result;
}

export async function dashboardReport(ctx, params = {}) {
  const { from, to } = reportRange(params);
  const dates = from ? { $gte: from, $lt: to } : undefined;
  const invoices = await find(ctx, "Invoices", dates ? { createdAt: dates } : {}, { sort: { createdAt: -1 } });
  const invoiceIds = invoices.map((row) => row.id);
  const stayIds = invoices.map((row) => row.stayId);
  const [lines, adjustments, receipts, refunds, returns, rooms, stays, customers] = await Promise.all([
    find(ctx, "InvoiceLines", { invoiceId: { $in: invoiceIds } }),
    find(ctx, "Adjustments", { invoiceId: { $in: invoiceIds } }),
    find(ctx, "Receipts", { stayId: { $in: stayIds } }),
    find(ctx, "Refunds", { invoiceId: { $in: invoiceIds } }),
    find(ctx, "ReceiptReturns"),
    find(ctx, "Rooms"),
    find(ctx, "Stays"),
    find(ctx, "Customers", {}, { project: { id: 1, name: 1 } }),
  ]);
  const totalFor = (rows, key, value, field = "amount") => rows.reduce((n, row) => n + (row[key] === value ? row[field] : 0), 0);
  const bySource = Object.fromEntries(sources.map((key) => [key, 0]));
  const invoiceCounts = { UNPAID: 0, PARTIAL: 0, PAID: 0 };
  const unpaidInvoices = [];
  let revenue = 0, debt = 0;
  for (const invoice of invoices) {
    const effectiveTotal = invoice.total - totalFor(adjustments, "invoiceId", invoice.id);
    const invoiceReceipts = receipts.filter((row) => row.stayId === invoice.stayId);
    const paid = invoiceReceipts.reduce((n, row) => n + row.amount - totalFor(returns, "receiptId", row.id), 0)
      - totalFor(refunds, "invoiceId", invoice.id);
    const balance = Math.max(0, effectiveTotal - paid);
    const paymentStatus = balance === 0 ? "PAID" : paid > 0 ? "PARTIAL" : "UNPAID";
    invoiceCounts[paymentStatus]++;
    debt += balance;
    revenue += effectiveTotal;
    const allocation = revenueSources(lines.filter((row) => row.invoiceId === invoice.id), effectiveTotal);
    for (const source of sources) bySource[source] += allocation[source];
    if (balance && unpaidInvoices.length < 30) {
      const stay = stays.find((row) => row.id === invoice.stayId);
      unpaidInvoices.push({ id: invoice.id, stayId: invoice.stayId, total: effectiveTotal, paid, balance,
        paymentStatus, roomNumber: rooms.find((row) => row.id === stay?.roomId)?.number,
        customerName: customers.find((row) => row.id === stay?.customerId)?.name });
    }
  }
  const dateFilter = dates ? { createdAt: dates } : {};
  const collected = await sum(ctx, "Receipts", dateFilter) - await sum(ctx, "Refunds", dateFilter)
    - await sum(ctx, "ReceiptReturns", dateFilter);
  const within = (at) => at && (!from || (new Date(at) >= from && new Date(at) < to));
  const arrivals = stays.filter((row) => within(row.startedAt)).length;
  const departures = stays.filter((row) => within(row.endedAt));
  const day = new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
  const occupancyFrom = from || new Date(day + "T00:00:00+07:00");
  const occupancyTo = to || new Date(occupancyFrom.getTime() + 86400000);
  const usableRooms = rooms.filter((room) => room.enabled);
  const roomIds = new Set(usableRooms.map((room) => room.id));
  let occupiedMs = 0;
  const usedRooms = new Set();
  for (const stay of stays) {
    if (!roomIds.has(stay.roomId)) continue;
    const elapsed = Math.min(new Date(stay.endedAt || Date.now()).getTime(), occupancyTo.getTime())
      - Math.max(new Date(stay.startedAt).getTime(), occupancyFrom.getTime());
    if (elapsed > 0) { occupiedMs += elapsed; usedRooms.add(stay.roomId); }
  }
  const capacityMs = usableRooms.length * (occupancyTo - occupancyFrom);
  const invoicedStays = new Set(stayIds);
  const containsDemoData = stays.some(stay => invoicedStays.has(stay.id) && stay.source === "Demo 60 ngày");
  return { revenue, collected, debt, unpaidInvoices, containsDemoData,
    report: { from: from?.toISOString() || null, to: to?.toISOString() || null, bySource, invoiceCounts,
      arrivals, departures: departures.length, stays: arrivals,
      averageStayHours: departures.length ? departures.reduce((n, row) => n + (new Date(row.endedAt) - new Date(row.startedAt)) / 3600000, 0) / departures.length : 0,
      usedRooms: usedRooms.size,
      occupancyRate: capacityMs ? Math.min(100, occupiedMs / capacityMs * 100) : 0 } };
}
