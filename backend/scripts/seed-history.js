import { fileURLToPath } from "node:url";
import path from "node:path";
import { transaction, closeDatabase } from "../src/db.js";
import { first, find, insert } from "../src/mongo-store.js";
import { assert, priceRoom, normalizePhone } from "../src/domain.js";
import { id, audit } from "../src/repository.js";

const marker = "demo.history.60d.v1";
const source = "Demo 60 ngày";
const dayMs = 86400000;
const hourMs = 3600000;
const dayVN = date => new Date(new Date(date).getTime() + 7 * hourMs).toISOString().slice(0, 10);
const overlaps = (start, end, otherStart, otherEnd) => start < new Date(otherEnd || 8640000000000000) && end > new Date(otherStart);

// Explicit, additive demo fixture import. Never changes existing rooms, accounts,
// prices or business records. Each historical day and its checkpoint are atomic.
export async function seedHistory({ now = new Date(), onProgress = () => {} } = {}) {
  const batch = await transaction(async tx => {
    const done = await first(tx, "AuditLogs", { action: marker });
    if (done) return { done: true, ...JSON.parse(done.details) };
    const started = await first(tx, "AuditLogs", { action: marker + ".started" });
    if (started) return JSON.parse(started.details);
    const admin = await first(tx, "Users", { role: "Admin", enabled: true }, { sort: { username: 1 } });
    assert(admin, "Cần Admin và dữ liệu phòng trước khi thêm lịch sử demo", 409);
    const rooms = await find(tx, "Rooms", { enabled: true }, { sort: { number: 1 }, limit: 20 });
    assert(rooms.length, "Chưa có phòng; chạy seed demo ban đầu hoặc tạo phòng trước", 409);
    const customers = [];
    const usedPhones = new Set((await find(tx, "Customers")).flatMap(customer => {
      try { return [normalizePhone(customer.phone)]; } catch { return []; }
    }));
    const surnames = ["Nguyễn", "Trần", "Lê", "Phạm", "Hoàng", "Võ", "Đặng", "Bùi"];
    const names = ["Minh Anh", "Hoài Nam", "Thu Hà", "Đức Huy", "Ngọc Lan"];
    for (let i = 0; i < 40; i++) {
      // Reserve an unused phone; never merge a synthetic guest into a real one.
      let phone = "0998" + String(i).padStart(6, "0");
      for (let attempt = 0; usedPhones.has(phone); attempt++) {
        assert(attempt < 100, "Không tìm được số điện thoại trống cho dữ liệu demo", 409);
        phone = "0998" + String((attempt + 1) * 40 + i).padStart(6, "0");
      }
      const customer = { id: id(), name: surnames[i % surnames.length] + " " + names[Math.floor(i / surnames.length)], phone, notes: source };
      await insert(tx, "Customers", customer);
      usedPhones.add(phone);
      customers.push(customer.id);
    }
    const services = [];
    for (const [code, name, category, unit, price, specialPurpose] of [
      ["DEMO_HISTORY_WATER", "Nước suối · demo", "SERVICE", "Chai", 10000, null],
      ["DEMO_HISTORY_FOOD", "Bữa sáng · demo", "FOOD", "Phần", 35000, null],
      ["DEMO_HISTORY_SUPPORT", "Hỗ trợ bữa ăn · demo", "SPECIAL", "Lượt", 50000, "MEAL_ASSISTANCE"],
    ]) {
      assert(!await first(tx, "Services", { code }), "Mã dịch vụ demo đã tồn tại ngoài đợt seed", 409);
      const service = { id: id(), code, name, category, unit, price, specialPurpose, enabled: false };
      await insert(tx, "Services", service);
      services.push(service);
    }
    const end = new Date(dayVN(now) + "T00:00:00+07:00");
    const details = { days: 60, from: dayVN(new Date(end - 60 * dayMs)), to: dayVN(new Date(end - dayMs)),
      adminId: admin.id, roomIds: rooms.map(room => room.id), customers, services };
    await audit(tx, { ...admin, kind: "staff" }, marker + ".started", admin.id, details);
    return details;
  });
  if (batch.done) {
    const { done, ...summary } = batch;
    void done;
    return { skipped: true, ...summary };
  }
  const summary = { days: 60, from: batch.from, to: batch.to, stays: 0, bookings: 0, invoices: 0, orders: 0, receipts: 0, customers: 40, revenue: 0 };
  for (let day = 0; day < batch.days; day++) {
    const result = await transaction(async tx => {
      const date = dayVN(new Date(new Date(batch.from + "T00:00:00+07:00").getTime() + day * dayMs));
      const dayMarker = marker + ".day." + date;
      const completed = await first(tx, "AuditLogs", { action: dayMarker });
      if (completed) return JSON.parse(completed.details);
      const admin = await first(tx, "Users", { id: batch.adminId, role: "Admin", enabled: true });
      assert(admin, "Admin của đợt seed không còn hoạt động", 409);
      const actor = { ...admin, kind: "staff" };
      const rooms = await find(tx, "Rooms", { id: { $in: batch.roomIds }, enabled: true }, { sort: { number: 1 } });
      const types = await find(tx, "RoomTypes");
      const base = new Date(date + "T00:00:00+07:00").getTime();
      const ranges = { $lt: new Date(base + dayMs) };
      const stays = await find(tx, "Stays", { roomId: { $in: batch.roomIds }, startedAt: ranges,
        $or: [{ endedAt: null }, { endedAt: { $gt: new Date(base - dayMs) } }] });
      const bookings = await find(tx, "Bookings", { roomId: { $in: batch.roomIds }, status: "CONFIRMED", startsAt: ranges, endsAt: { $gt: new Date(base - dayMs) } });
      const maintenance = await find(tx, "Maintenance", { roomId: { $in: batch.roomIds }, startsAt: ranges, endsAt: { $gt: new Date(base - dayMs) } });
      const counts = { stays: 0, bookings: 0, invoices: 0, orders: 0, receipts: 0, revenue: 0 };
      const weekend = [0, 6].includes(new Date(date).getUTCDay());
      const target = Math.min(rooms.length, (weekend ? 10 : 6) + day % 3);
      for (let offset = 0; offset < rooms.length && counts.stays < target; offset++) {
        const room = rooms[(day * 3 + offset) % rooms.length];
        const type = types.find(type => type.id === room.typeId);
        assert(type, "Thiếu loại phòng trong dữ liệu hiện có", 409);
        const rate = JSON.parse(type.rateJson);
        const mode = (day + offset) % 3 ? "HOUR" : "NIGHT";
        const startedAt = new Date(base + (mode === "NIGHT" ? -5 : 8 + offset % 5) * hourMs);
        const endedAt = new Date(mode === "NIGHT" ? base + 10 * hourMs : startedAt.getTime() + (2 + day % 3) * hourMs);
        const blocked = stays.some(stay => stay.roomId === room.id && overlaps(startedAt, endedAt, stay.startedAt, stay.endedAt)) ||
          bookings.some(booking => booking.roomId === room.id && overlaps(startedAt, endedAt, booking.startsAt, booking.endsAt)) ||
          maintenance.some(item => item.roomId === room.id && overlaps(startedAt, endedAt, item.startsAt, item.endsAt));
        if (blocked) continue;
        const index = day * 20 + offset;
        const stayId = id(), invoiceId = id();
        const customerId = batch.customers[index % batch.customers.length];
        const bookingId = index % 3 === 0 ? id() : null;
        if (bookingId) {
          await insert(tx, "Bookings", { id: bookingId, roomId: room.id, customerId, startsAt: startedAt, endsAt: endedAt,
            guests: Math.min(2, type.capacity), mode, status: "CHECKED_IN", source, createdAt: new Date(startedAt - dayMs) });
          counts.bookings++;
        }
        await insert(tx, "Stays", { id: stayId, roomId: room.id, customerId, bookingId, startedAt, endedAt, expectedEnd: endedAt,
          status: "CLOSED", guests: Math.min(2, type.capacity), mode, rateJson: type.rateJson, cycle: 0, source });
        const pricing = priceRoom(rate, startedAt, endedAt, mode);
        const lines = [{ name: "Tiền phòng", quantity: 1, unitPrice: pricing.total, category: "ROOM" }];
        for (const [serviceIndex, every] of [[0, 2], [1, 3], [2, 7]]) {
          if (index % every) continue;
          const service = batch.services[serviceIndex];
          const quantity = serviceIndex === 0 ? 2 : 1;
          const item = { serviceId: service.id, name: service.name, unit: service.unit, unitPrice: service.price, quantity, notes: source };
          const orderedAt = new Date(startedAt.getTime() + 20 * 60000);
          let orderId = null;
          if (service.category !== "SERVICE") {
            orderId = id();
            await insert(tx, "Orders", { id: orderId, kind: service.category, specialPurpose: service.specialPurpose, stayId,
              status: "COMPLETED", itemsJson: JSON.stringify([item]), total: quantity * service.price, notes: source,
              createdBy: admin.id, requestedAt: orderedAt, startedAt: new Date(orderedAt.getTime() + 5 * 60000),
              completedAt: new Date(orderedAt.getTime() + 15 * 60000), updatedAt: new Date(orderedAt.getTime() + 15 * 60000) });
            counts.orders++;
          }
          await insert(tx, "StayServiceItems", { id: id(), stayId, serviceId: service.id, name: service.name,
            unitPrice: service.price, quantity, category: service.category, orderId });
          lines.push({ name: service.name, quantity, unitPrice: service.price, category: service.category });
        }
        const total = lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0);
        // A small, explicit share of fixtures illustrates unpaid/partial invoices.
        const paid = index % 19 === 0 ? 0 : index % 11 === 0 ? Math.floor(total / 2) : total;
        await insert(tx, "Invoices", { id: invoiceId, stayId, total, originalTotal: total, roomJson: JSON.stringify(pricing),
          debtReason: paid < total ? "Công nợ mẫu · " + source : null, createdAt: endedAt });
        for (const line of lines) await insert(tx, "InvoiceLines", { id: id(), invoiceId, ...line, total: line.quantity * line.unitPrice });
        if (paid > 0) {
          const receiptId = id();
          await insert(tx, "Receipts", { id: receiptId, stayId, amount: paid, method: index % 2 ? "CASH" : "TRANSFER", actorId: admin.id, createdAt: endedAt });
          await insert(tx, "PaymentAllocations", { receiptId, invoiceId, amount: paid });
          counts.receipts++;
        }
        counts.stays++;
        counts.invoices++;
        counts.revenue += total;
      }
      assert(counts.stays > 0, "Không có khoảng phòng trống để thêm demo ngày " + date + "; các ngày đã hoàn tất được giữ để chạy tiếp", 409);
      await audit(tx, actor, dayMarker, admin.id, counts);
      return counts;
    });
    for (const key of ["stays", "bookings", "invoices", "orders", "receipts", "revenue"]) summary[key] += result[key];
    onProgress({ day: day + 1, days: batch.days });
  }
  await transaction(async tx => {
    if (!await first(tx, "AuditLogs", { action: marker })) {
      const admin = await first(tx, "Users", { id: batch.adminId });
      await audit(tx, { ...admin, kind: "staff" }, marker, admin.id, summary);
    }
  });
  return { skipped: false, ...summary };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    console.log(JSON.stringify(await seedHistory({ onProgress: ({ day, days }) => console.error(`Demo history ${day}/${days}`) }), null, 2));
  } catch (error) {
    console.error(error.status ? error.message : "Seed lịch sử thất bại; ngày đang ghi đã rollback. Có thể chạy lại để tiếp tục.");
    process.exitCode = 1;
  } finally {
    await closeDatabase();
  }
}
