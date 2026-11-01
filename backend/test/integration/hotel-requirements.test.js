import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { createApp } from "../../src/app.js";
import { config } from "../../src/config.js";
import { database, closeDatabase, transaction, query } from "../../src/db.js";

const app = createApp();
const post = (token, action, body, key = randomUUID()) =>
  request(app)
    .post("/api/actions/" + action)
    .set("Authorization", "Bearer " + token)
    .set("Idempotency-Key", key)
    .send(body);
const get = (token, path) =>
  request(app).get("/api/" + path).set("Authorization", "Bearer " + token);
function ok(response) {
  assert.equal(response.status, 200, JSON.stringify(response.body));
  return response.body;
}
async function login(username) {
  return ok(await request(app).post("/api/auth/login").send({
    username,
    password: process.env.DEMO_SEED_PASSWORD,
  }));
}

test("Updated hotel requirements: customer identity, optional departures and auditable checkout", async (t) => {
  assert.match(config.mongo.database, /^StayFlow_\d+Test$/);
  const admin = await login("admin"), desk = await login("letan");
  const db = await database();
  const suffix = randomUUID().slice(0, 8);
  const type = ok(await post(admin.token, "roomType", {
    name: "Requirements " + suffix,
    capacity: 2,
    rate: { hour: 100000, night: 300000, graceMinutes: 15, extraHour: 50000 },
  }));
  async function room(name) {
    return ok(await post(admin.token, "room", {
      number: "REQ-" + suffix + "-" + name,
      typeId: type.id,
      zone: "Requirements",
    }));
  }
  const phone = "09" + String(Math.floor(Math.random() * 100000000)).padStart(8, "0");
  const customer = { name: "Khách kiểm thử", phone, notes: "Ghi chú ban đầu" };
  try {
    await t.test("new customers work in booking and direct check-in with optional notes and safe retries", async () => {
      let sequence = 0;
      for (const token of [admin.token, desk.token]) {
        for (const action of ["booking", "checkin"]) {
          for (const mode of ["HOUR", "NIGHT"]) {
            const freshPhone = "07" + phone.slice(2, 9) + sequence++;
            const r = await room("new-" + sequence);
            const key = randomUUID();
            const body = {
              roomId: r.id,
              customer: { name: "Khách mới " + sequence, phone: "+84 " + freshPhone.slice(1) },
              guests: 1,
              mode,
            };
            const result = ok(await post(token, action, body, key));
            assert.deepEqual(ok(await post(token, action, body, key)), result);
            const customers = await db.db.collection("Customers").find({ phone: freshPhone }).toArray();
            assert.equal(customers.length, 1);
            assert.equal(customers[0].name, body.customer.name);
            assert.equal(customers[0].notes, "");
            assert.equal(customers[0].tier, "STANDARD");
            const collection = action === "booking" ? "Bookings" : "Stays";
            const rows = await db.db.collection(collection).find({ roomId: r.id }).toArray();
            assert.equal(rows.length, 1);
            assert.equal(rows[0].id, result.id);
            assert.equal(rows[0].customerId, customers[0].id);
            assert.equal(rows[0].mode, mode);
            const lookup = ok(await get(token, "customer-lookup?phone=" + freshPhone));
            assert.equal(lookup.id, customers[0].id);
          }
        }
      }
    });
    await t.test("standalone customer creation can be reused without losing membership", async () => {
      const newPhone = "06" + phone.slice(2);
      const body = { name: "Khách tạo riêng", phone: newPhone };
      const key = randomUUID();
      const created = ok(await post(desk.token, "customer", body, key));
      assert.deepEqual(ok(await post(desk.token, "customer", body, key)), created);
      assert.equal((await post(desk.token, "customer", body)).status, 409);
      ok(await post(admin.token, "membership", { customerId: created.id, tier: "GOLD" }));
      const r = await room("existing-customer");
      const stay = ok(await post(desk.token, "checkin", {
        roomId: r.id,
        customerId: created.id,
        customer: { ...body, phone: "+84" + newPhone.slice(1), name: "Tên cập nhật" },
        guests: 1,
        mode: "HOUR",
      }));
      assert.equal((await db.db.collection("Stays").findOne({ id: stay.id })).customerId, created.id);
      const saved = await db.db.collection("Customers").findOne({ id: created.id });
      assert.equal(saved.name, "Tên cập nhật");
      assert.equal(saved.tier, "GOLD");
      assert.equal(await db.db.collection("Customers").countDocuments({ phone: newPhone }), 1);
    });
    await t.test("failed direct check-in rolls back a new customer and can retry after correcting the form", async () => {
      const r = await room("new-checkin-rollback");
      const newPhone = "05" + phone.slice(2);
      const body = {
        roomId: r.id,
        customer: { name: "Khách nhận phòng mới", phone: newPhone, notes: "" },
        mode: "HOUR",
        guests: 20,
      };
      assert.equal((await post(desk.token, "checkin", body)).status, 400);
      assert.equal(await db.db.collection("Customers").countDocuments({ phone: newPhone }), 0);
      assert.equal(await db.db.collection("Stays").countDocuments({ roomId: r.id }), 0);
      ok(await post(desk.token, "checkin", { ...body, guests: 1 }));
      assert.equal(await db.db.collection("Customers").countDocuments({ phone: newPhone }), 1);
    });
    await t.test("concurrent bookings reuse normalized customer and derive departure", async () => {
      const a = await room("A"), b = await room("B");
      const startsAt = new Date(Date.now() + 24 * 3600000).toISOString();
      const responses = await Promise.all([
        post(desk.token, "booking", { roomId: a.id, customer, startsAt, mode: "HOUR", guests: 1 }),
        post(desk.token, "booking", {
          roomId: b.id,
          customer: { ...customer, phone: "+84 " + phone.slice(1) },
          startsAt,
          mode: "NIGHT",
          guests: 1,
        }),
      ]);
      const ids = responses.map(ok).map((row) => row.id);
      const bookings = await db.db.collection("Bookings").find({ id: { $in: ids } }).toArray();
      assert.equal(new Set(bookings.map((row) => row.customerId)).size, 1);
      assert(bookings.every((row) => row.endsAt > row.startsAt));
      assert.equal(await db.db.collection("Customers").countDocuments({ phone }), 1);
    });
    await t.test("invalid booking rolls back inline customer creation", async () => {
      const r = await room("rollback");
      const badPhone = "08" + phone.slice(2);
      assert.equal((await post(desk.token, "booking", {
        roomId: r.id,
        customer: { name: "Không được lưu", phone: badPhone },
        guests: 20,
        mode: "HOUR",
      })).status, 400);
      assert.equal(await db.db.collection("Customers").countDocuments({ phone: badPhone }), 0);
    });
    await t.test("check-in accepts no departure, updates selected customer and rejects new DAY", async () => {
      const r = await room("checkin");
      const stored = await db.db.collection("Customers").findOne({ phone });
      assert.equal((await post(desk.token, "checkin", {
        roomId: r.id, customerId: stored.id, mode: "DAY", guests: 1,
      })).status, 400);
      const stay = ok(await post(desk.token, "checkin", {
        roomId: r.id,
        customerId: stored.id,
        customer: { name: "Tên đã cập nhật", phone: "+84" + phone.slice(1) },
        mode: "HOUR",
        guests: 2,
      }));
      const row = await db.db.collection("Stays").findOne({ id: stay.id });
      assert.equal(row.expectedEnd - row.startedAt, 3600000);
      const updated = await db.db.collection("Customers").findOne({ id: stored.id });
      assert.equal(updated.name, "Tên đã cập nhật");
      assert.equal(updated.notes, "Ghi chú ban đầu");
      const q = ok(await get(desk.token, "quote?stayId=" + stay.id));
      assert.equal(q.total, 100000);
      assert.equal((await post(desk.token, "checkout", {
        stayId: stay.id, finalTotal: 120000, paymentAmount: 120000,
      })).status, 400);
      assert.equal(await db.db.collection("Receipts").countDocuments({ stayId: stay.id }), 0);
      const key = randomUUID();
      const body = {
        stayId: stay.id,
        finalTotal: 120000,
        adjustmentReason: "Phụ thu khách yêu cầu thêm",
        paymentAmount: 120000,
        paymentMethod: "TRANSFER",
      };
      const invoice = ok(await post(desk.token, "checkout", body, key));
      assert.equal(ok(await post(desk.token, "checkout", body, key)).id, invoice.id);
      const saved = await db.db.collection("Invoices").findOne({ id: invoice.id });
      assert.equal(saved.originalTotal, 100000);
      assert.equal(saved.total, 120000);
      assert.equal(saved.adjustmentAmount, 20000);
      assert.equal(saved.adjustedBy, desk.user.id);
      assert.equal(saved.adjustmentReason, body.adjustmentReason);
      assert(saved.adjustedAt instanceof Date);
      const receipts = await db.db.collection("Receipts").find({ stayId: stay.id }).toArray();
      assert.equal(receipts.length, 1);
      assert.equal(receipts[0].amount, 120000);
      assert.equal(receipts[0].method, "TRANSFER");
      assert.equal(ok(await get(desk.token, "quote?stayId=" + stay.id)).balance, 0);
      const roomRow = await db.db.collection("Rooms").findOne({ id: r.id });
      assert.equal(roomRow.cleanState, "DIRTY");
    });
    await t.test("booking check-in uses stored room/customer/mode without duplicate fields", async () => {
      const r = await room("booking-in");
      const booking = ok(await post(desk.token, "booking", {
        roomId: r.id, customer, mode: "HOUR", guests: 1,
      }));
      const stay = ok(await post(desk.token, "checkin", { bookingId: booking.id }));
      const row = await db.db.collection("Stays").findOne({ id: stay.id });
      assert.equal(row.roomId, r.id);
      assert.equal(row.mode, "HOUR");
      assert.equal(row.bookingId, booking.id);
    });
    await t.test("payRemaining calculates exact post-voucher payment and receptionist reductions are audited", async () => {
      const r = await room("remaining");
      const stay = ok(await post(desk.token, "checkin", {
        roomId: r.id, customer, guests: 1, mode: "HOUR",
      }));
      const code = "REQ" + suffix.toUpperCase();
      ok(await post(admin.token, "voucher", {
        code,
        discount: 10000,
        minTotal: 50000,
        startsAt: new Date(Date.now() - 3600000).toISOString(),
        endsAt: new Date(Date.now() + 3600000).toISOString(),
        maxUses: 10,
        perCustomer: 1,
      }));
      const paid = ok(await post(desk.token, "checkout", {
        stayId: stay.id, voucherCode: code, payRemaining: true, paymentMethod: "CASH",
      }));
      assert.equal(paid.total, 90000);
      const receipt = await db.db.collection("Receipts").findOne({ stayId: stay.id });
      assert.equal(receipt.amount, 90000);
      const invoice = await db.db.collection("Invoices").findOne({ id: paid.id });
      assert.equal(invoice.originalTotal, 90000);
      assert.equal(invoice.adjustmentAmount, 0);
      assert.equal(invoice.adjustedBy, null);
      const reducedRoom = await room("reduced");
      const reducedStay = ok(await post(desk.token, "checkin", {
        roomId: reducedRoom.id, customer, guests: 1, mode: "HOUR",
      }));
      const reduced = ok(await post(desk.token, "checkout", {
        stayId: reducedStay.id,
        finalTotal: 80000,
        adjustmentReason: "Giảm tiền vì chất lượng phòng",
        payRemaining: true,
      }));
      const saved = await db.db.collection("Invoices").findOne({ id: reduced.id });
      assert.equal(saved.originalTotal, 100000);
      assert.equal(saved.total, 80000);
      assert.equal(saved.adjustmentAmount, -20000);
      assert.equal(saved.adjustedBy, desk.user.id);
      assert.equal(ok(await get(desk.token, "quote?stayId=" + reducedStay.id)).balance, 0);
    });
    await t.test("ordinary service paths cannot mutate food/special or completed order charges", async () => {
      const r = await room("catalog");
      const stay = ok(await post(desk.token, "checkin", { roomId: r.id, customer, mode: "HOUR", guests: 1 }));
      for (const category of ["FOOD", "SPECIAL"]) {
        const serviceId = randomUUID();
        await transaction((tx) => query(tx, () => ({
          collection: "Services",
          insert: {
            id: serviceId,
            code: category + "_" + suffix.toUpperCase(),
            name: "Private " + category,
            price: 20000,
            unit: "lần",
            category,
          },
        })));
        assert.equal((await post(desk.token, "serviceItem", {
          stayId: stay.id, serviceId, quantity: 1,
        })).status, 403);
        assert.equal((await post(admin.token, "service", {
          id: serviceId,
          code: "EDIT_CATALOG",
          name: "Bypass",
          price: 1,
          unit: "lần",
        })).status, 409);
      }
    });
    await t.test("Admin can assign explicit special access but cannot create new Cleaner accounts", async () => {
      const base = { username: "req_" + suffix, name: "Nhân viên", password: "Requirements!2026" };
      assert.equal((await post(admin.token, "user", { ...base, role: "Cleaner" })).status, 400);
      const user = ok(await post(admin.token, "user", {
        ...base, role: "Receptionist", canAccessSpecialServices: true,
      }));
      const saved = await db.db.collection("Users").findOne({ id: user.id });
      assert.equal(saved.canAccessSpecialServices, true);
    });
  } finally {
    await closeDatabase();
  }
});
