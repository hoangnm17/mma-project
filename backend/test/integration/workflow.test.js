import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { createApp } from "../../src/app.js";
import { config } from "../../src/config.js";
import {
  database,
  one,
  query,
  transaction,
  closeDatabase,
} from "../../src/db.js";
import { dispatch } from "../../src/services/housekeeping.js";
import { tick } from "../../src/worker.js";
const app = createApp();
const key = () => randomUUID();
const future = (h) => new Date(Date.now() + h * 3600000).toISOString();
async function logIn(username) {
  const r = await request(app)
    .post("/api/auth/login")
    .send({ username, password: process.env.DEMO_SEED_PASSWORD });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return r.body;
}
function get(token, resource) {
  return request(app)
    .get("/api/" + resource)
    .set("Authorization", "Bearer " + token);
}
function post(token, action, body, k = key()) {
  return request(app)
    .post("/api/actions/" + action)
    .set("Authorization", "Bearer " + token)
    .set("Idempotency-Key", k)
    .send(body);
}
function ok(r) {
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return r.body;
}
test("StayFlow SQL Server integration", async (t) => {
  assert(
    config.sql.database.endsWith("Test"),
    "Chỉ chạy integration trên database có hậu tố Test",
  );
  const admin = await logIn("admin"),
    desk = await logIn("letan"),
    c1 = await logIn("cleaner1"),
    c2 = await logIn("cleaner2");
  const db = await database();
  await transaction((tx) =>
    query(
      tx,
      "UPDATE CleanerProfiles SET accepting=0 WHERE userId NOT IN (@a,@b)",
      { a: c1.user.id, b: c2.user.id },
    ),
  );
  let taskId, winner, guestToken, stayId, invoiceId;
  try {
    await t.test(
      "RBAC, cleaner không đọc khách/doanh thu, lễ tân không tạo Admin",
      async () => {
        for (const resource of ["customers", "invoices", "dashboard", "rooms"])
          assert.equal((await get(c1.token, resource)).status, 403);
        assert.equal(
          (
            await post(desk.token, "user", {
              username: "hacker",
              name: "Hack",
              role: "Admin",
              password: "Password!123",
            })
          ).status,
          403,
        );
        assert.equal((await request(app).get("/api/rooms")).status, 401);
      },
    );
    const rooms = ok(await get(admin.token, "rooms"));
    const customers = ok(await get(admin.token, "customers"));
    const openStays = ok(await get(admin.token, "stays")).filter(
      (s) => s.status === "OPEN",
    );
    await t.test("Hai booking cạnh tranh: chỉ một được ghi", async () => {
      const body = {
        roomId: rooms.find((r) => r.number === "401").id,
        customerId: customers[0].id,
        startsAt: future(72),
        endsAt: future(96),
        guests: 1,
        mode: "DAY",
      };
      const results = await Promise.all([
        post(desk.token, "booking", body),
        post(desk.token, "booking", body),
      ]);
      assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
    });
    await t.test(
      "Booking cọc → check-in → snapshot và idempotency",
      async () => {
        const booking = ok(
          await post(desk.token, "booking", {
            roomId: rooms.find((r) => r.number === "402").id,
            customerId: customers[0].id,
            startsAt: future(0.01),
            endsAt: future(24),
            guests: 1,
            mode: "DAY",
            deposit: 100000,
            method: "CASH",
          }),
        );
        const body = {
          bookingId: booking.id,
          roomId: rooms[0].id,
          customerId: customers[0].id,
          expectedEnd: future(24),
          guests: 1,
          mode: "DAY",
        };
        const k = key();
        const a = ok(await post(desk.token, "checkin", body, k)),
          b = ok(await post(desk.token, "checkin", body, k));
        assert.equal(a.id, b.id);
        stayId = a.id;
        const q = ok(await get(desk.token, "quote?stayId=" + stayId));
        assert.equal(q.paid, 100000);
        assert.equal(q.total, 450000);
      },
    );
    await t.test(
      "Guest token hash, scope, AI fallback không ghi task",
      async () => {
        const link = ok(await post(desk.token, "guest-link", { stayId }));
        const token = new URL(link.url).hash.slice(7);
        const exchanged = await request(app)
          .post("/api/guest-access/exchange")
          .send({ token });
        guestToken = ok(exchanged).token;
        assert.equal((await get(guestToken, "customers")).status, 403);
        assert.equal(
          (
            await post(guestToken, "dnd", {
              stayId: openStays[0].id,
              dnd: true,
            })
          ).status,
          403,
        );
        const before = (await query(db, "SELECT id FROM HousekeepingTasks"))
          .length;
        const ai = await request(app)
          .post("/api/ai/draft")
          .set("Authorization", "Bearer " + guestToken)
          .send({ stayId, text: "Chiều nay 3 giờ dọn phòng giúp tôi" });
        assert.equal(ai.status, 503);
        assert.equal(
          (await query(db, "SELECT id FROM HousekeepingTasks")).length,
          before,
        );
      },
    );
    await t.test(
      "DND chặn, xác nhận mới tạo task và chống yêu cầu trùng",
      async () => {
        ok(await post(guestToken, "dnd", { stayId, dnd: true }));
        const body = {
          stayId,
          serviceCode: "TOWELS",
          windowStart: new Date(Date.now() - 1000).toISOString(),
          windowEnd: future(1),
          entryConsent: true,
          feeApproved: true,
        };
        assert.equal((await post(guestToken, "task-create", body)).status, 409);
        ok(await post(guestToken, "dnd", { stayId, dnd: false }));
        taskId = ok(await post(guestToken, "task-create", body)).id;
        assert.equal((await post(guestToken, "task-create", body)).status, 409);
        await transaction(dispatch);
      },
    );
    await t.test(
      "Hai Cleaner nhận một việc: đúng một assignment active",
      async () => {
        const a = ok(await get(c1.token, "offers")).find(
            (o) => o.taskId === taskId,
          ),
          b = ok(await get(c2.token, "offers")).find(
            (o) => o.taskId === taskId,
          );
        assert(a && b);
        const result = await Promise.all([
          post(c1.token, "offer-accept", { offerId: a.id }),
          post(c2.token, "offer-accept", { offerId: b.id }),
        ]);
        assert.deepEqual(result.map((r) => r.status).sort(), [200, 409]);
        winner = result[0].status === 200 ? c1 : c2;
        const rows = await query(
          db,
          "SELECT * FROM CleaningAssignments WHERE taskId=@id AND isActive=1",
          { id: taskId },
        );
        assert.equal(rows.length, 1);
        assert.equal(rows[0].cleanerId, winner.user.id);
        const accepted = result[0].status === 200 ? a : b;
        assert.equal(
          ok(await post(winner.token, "offer-accept", { offerId: accepted.id }))
            .id,
          rows[0].id,
        );
      },
    );
    await t.test(
      "Checklist, nộp đóng assignment, làm lại giữ lịch sử",
      async () => {
        assert.equal(
          (
            await post((winner === c1 ? c2 : c1).token, "task-start", {
              taskId,
            })
          ).status,
          403,
        );
        ok(await post(winner.token, "task-start", { taskId }));
        assert.equal(
          (await post(winner.token, "task-submit", { taskId, checklist: [] }))
            .status,
          400,
        );
        const task = await one(
          db,
          "SELECT * FROM HousekeepingTasks WHERE id=@id",
          { id: taskId },
        );
        ok(
          await post(winner.token, "task-submit", {
            taskId,
            checklist: JSON.parse(task.checklistJson),
          }),
        );
        assert.equal(
          (
            await query(
              db,
              "SELECT * FROM CleaningAssignments WHERE taskId=@id AND isActive=1",
              { id: taskId },
            )
          ).length,
          0,
        );
        ok(
          await post(desk.token, "task-verify", {
            taskId,
            passed: false,
            reason: "Cần kiểm tra lại khăn",
          }),
        );
        assert.equal(
          (
            await one(db, "SELECT status FROM HousekeepingTasks WHERE id=@id", {
              id: taskId,
            })
          ).status,
          "PENDING",
        );
        await transaction(dispatch);
        const offer = ok(await get(winner.token, "offers")).find(
          (o) => o.taskId === taskId,
        );
        ok(await post(winner.token, "offer-accept", { offerId: offer.id }));
        ok(await post(winner.token, "task-start", { taskId }));
        ok(
          await post(winner.token, "task-submit", {
            taskId,
            checklist: JSON.parse(task.checklistJson),
          }),
        );
        ok(await post(desk.token, "task-verify", { taskId, passed: true }));
        assert.equal(
          (
            await query(
              db,
              "SELECT id FROM CleaningAssignments WHERE taskId=@id",
              { id: taskId },
            )
          ).length,
          2,
        );
        const room = ok(await get(desk.token, "rooms")).find(
          (r) => r.stayId === stayId,
        );
        assert.equal(room.status, "OCCUPIED");
        ok(await post(guestToken, "task-review", { taskId, rating: 5 }));
        assert.equal(
          (await post(guestToken, "task-review", { taskId, rating: 5 })).status,
          409,
        );
      },
    );
    await t.test("Một Cleaner nhận hai task đồng thời: chỉ một", async () => {
      const offers = ok(await get(c1.token, "offers")).filter(
        (o) => o.taskId !== taskId,
      );
      assert(offers.length >= 2);
      const results = await Promise.all(
        offers
          .slice(0, 2)
          .map((o) => post(c1.token, "offer-accept", { offerId: o.id })),
      );
      assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
      const accepted = offers[results[0].status === 200 ? 0 : 1];
      ok(
        await post(desk.token, "task-reassign", {
          taskId: accepted.taskId,
          reason: "Kết thúc kiểm thử cạnh tranh",
        }),
      );
    });
    await t.test("Offer hết hạn / sửa lịch vô hiệu lời mời cũ", async () => {
      await transaction(dispatch);
      const offer = ok(await get(c2.token, "offers")).find(
        (o) => o.taskId !== taskId,
      );
      assert(offer);
      await transaction((tx) =>
        query(
          tx,
          "UPDATE CleaningOffers SET expiresAt=DATEADD(second,-1,SYSUTCDATETIME()) WHERE id=@id",
          { id: offer.id },
        ),
      );
      assert.equal(
        (await post(c2.token, "offer-accept", { offerId: offer.id })).status,
        409,
      );
      const other = ok(await get(c2.token, "offers")).find(
        (o) => o.taskId !== taskId,
      );
      assert(other);
      ok(
        await post(desk.token, "task-reschedule", {
          taskId: other.taskId,
          windowStart: future(2),
          windowEnd: future(3),
        }),
      );
      assert.equal(
        (await post(c2.token, "offer-accept", { offerId: other.id })).status,
        409,
      );
    });
    await t.test(
      "Thu tiền/check-out/refund retry không cộng cọc hai lần",
      async () => {
        const q = ok(await get(desk.token, "quote?stayId=" + stayId));
        const k = key(),
          body = { stayId, amount: q.balance, method: "TRANSFER" };
        const a = ok(await post(desk.token, "receipt", body, k)),
          b = ok(await post(desk.token, "receipt", body, k));
        assert.equal(a.id, b.id);
        assert.equal(
          (await post(desk.token, "receipt", { ...body, amount: 1 }, k)).status,
          409,
        );
        const ck = key(),
          checkout = { stayId };
        const inv = ok(await post(desk.token, "checkout", checkout, ck));
        assert.equal(
          ok(await post(desk.token, "checkout", checkout, ck)).id,
          inv.id,
        );
        invoiceId = inv.id;
        const closed = ok(await get(admin.token, "quote?stayId=" + stayId));
        assert.equal(closed.balance, 0);
        const count = await one(
          db,
          "SELECT COUNT(*) count FROM Receipts WHERE stayId=@stayId",
          { stayId },
        );
        assert.equal(count.count, 2);
        const refundKey = key(),
          refund = {
            invoiceId,
            amount: 50000,
            reason: "Giảm giá chất lượng dịch vụ",
          };
        ok(await post(admin.token, "refund", refund, refundKey));
        ok(await post(admin.token, "refund", refund, refundKey));
        const adjusted = ok(await get(admin.token, "quote?stayId=" + stayId));
        assert.equal(adjusted.balance, 0);
        assert.equal(adjusted.refunded, 50000);
        assert.equal(adjusted.adjustments, 50000);
      },
    );
    await t.test(
      "Checkout thu hồi guest, phòng bẩn và turnover gắn cycle",
      async () => {
        assert.equal((await get(guestToken, "tasks")).status, 401);
        const stay = await one(db, "SELECT * FROM Stays WHERE id=@id", {
          id: stayId,
        });
        const room = await one(db, "SELECT * FROM Rooms WHERE id=@id", {
          id: stay.roomId,
        });
        assert.equal(room.cleanState, "DIRTY");
        const turnover = await one(
          db,
          "SELECT * FROM HousekeepingTasks WHERE stayId=@id AND source='CHECKOUT'",
          { id: stayId },
        );
        assert.equal(turnover.cycle, room.cycle);
      },
    );
    await t.test("Turnover cũ không đánh dấu sạch chu kỳ mới", async () => {
      const turnover = await one(
        db,
        "SELECT * FROM HousekeepingTasks WHERE stayId=@id AND source='CHECKOUT'",
        { id: stayId },
      );
      ok(
        await post(desk.token, "task-assign", {
          taskId: turnover.id,
          cleanerId: c1.user.id,
        }),
      );
      ok(await post(c1.token, "task-start", { taskId: turnover.id }));
      ok(
        await post(c1.token, "task-submit", {
          taskId: turnover.id,
          checklist: JSON.parse(turnover.checklistJson),
        }),
      );
      await transaction((tx) =>
        query(
          tx,
          "UPDATE Rooms SET cycle=cycle+1,cleanState='DIRTY' WHERE id=@id",
          { id: turnover.roomId },
        ),
      );
      ok(
        await post(desk.token, "task-verify", {
          taskId: turnover.id,
          passed: true,
        }),
      );
      assert.equal(
        (
          await one(db, "SELECT cleanState FROM Rooms WHERE id=@id", {
            id: turnover.roomId,
          })
        ).cleanState,
        "DIRTY",
      );
    });
    await t.test(
      "Yêu cầu tương lai chưa giữ nhân viên và chưa gửi offer",
      async () => {
        const created = ok(
          await post(desk.token, "task-create", {
            stayId: openStays[2].id,
            serviceCode: "FULL",
            windowStart: future(4),
            windowEnd: future(5),
            entryConsent: true,
            feeApproved: true,
          }),
        );
        await transaction(dispatch);
        assert.equal(
          (
            await query(db, "SELECT id FROM CleaningOffers WHERE taskId=@id", {
              id: created.id,
            })
          ).length,
          0,
        );
      },
    );
    await t.test(
      "Hoàn cọc retry và hủy booking không tạo doanh thu giả",
      async () => {
        const booking = ok(
          await post(desk.token, "booking", {
            roomId: rooms.find((r) => r.number === "403").id,
            customerId: customers[0].id,
            startsAt: future(120),
            endsAt: future(144),
            guests: 1,
            mode: "DAY",
            deposit: 100000,
          }),
        );
        const r = ok(
          await get(admin.token, "booking-receipts?bookingId=" + booking.id),
        )[0];
        const refund = {
          receiptId: r.id,
          amount: 100000,
          reason: "Khách hủy lịch đặt phòng",
        };
        const k = key();
        assert.equal(
          (await post(desk.token, "receipt-return", refund)).status,
          403,
        );
        ok(await post(admin.token, "receipt-return", refund, k));
        ok(await post(admin.token, "receipt-return", refund, k));
        ok(await post(desk.token, "booking-cancel", { id: booking.id }));
        const returned = await one(
          db,
          "SELECT SUM(amount) total FROM ReceiptReturns WHERE receiptId=@id",
          { id: r.id },
        );
        assert.equal(returned.total, 100000);
      },
    );
    await t.test(
      "Voucher tối đa một lượt được kiểm tra trong checkout transaction",
      async () => {
        const voucher = ok(
          await post(admin.token, "voucher", {
            code: "ONCE",
            discount: 50000,
            minTotal: 100000,
            startsAt: future(-1),
            endsAt: future(2),
            maxUses: 1,
            perCustomer: 1,
          }),
        );
        assert(voucher.id);
        const stays = [];
        for (const number of ["404", "405"]) {
          const stay = ok(
            await post(desk.token, "checkin", {
              roomId: rooms.find((r) => r.number === number).id,
              customerId: customers[0].id,
              expectedEnd: future(20),
              guests: 1,
              mode: "DAY",
            }),
          );
          const q = ok(await get(desk.token, "quote?stayId=" + stay.id));
          ok(
            await post(desk.token, "receipt", {
              stayId: stay.id,
              amount: q.total - 50000,
              method: "CASH",
            }),
          );
          stays.push(stay);
        }
        const results = await Promise.all(
          stays.map((s) =>
            post(desk.token, "checkout", { stayId: s.id, voucherCode: "ONCE" }),
          ),
        );
        assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
        const uses = await one(
          db,
          "SELECT COUNT(*) count FROM VoucherRedemptions WHERE voucherId=@id",
          { id: voucher.id },
        );
        assert.equal(uses.count, 1);
      },
    );
    await t.test(
      "Bảo trì chặn booking và baseline thiếu lịch sử trả thông báo",
      async () => {
        const room = rooms.find((r) => r.number === "303");
        const maintenance = ok(
          await post(desk.token, "maintenance", {
            roomId: room.id,
            startsAt: future(100),
            endsAt: future(110),
            reason: "Bảo trì máy lạnh",
          }),
        );
        assert.equal(
          (
            await post(desk.token, "booking", {
              roomId: room.id,
              customerId: customers[0].id,
              startsAt: future(101),
              endsAt: future(105),
              guests: 1,
              mode: "DAY",
            })
          ).status,
          409,
        );
        ok(
          await post(desk.token, "maintenance-resolve", { id: maintenance.id }),
        );
        assert.equal(
          ok(await get(desk.token, "forecast?days=7")).available,
          false,
        );
        assert.equal((await get(c1.token, "forecast")).status, 403);
      },
    );
    await t.test(
      "Khóa tài khoản chặn token đã cấp ngay request sau",
      async () => {
        const u = ok(await get(admin.token, "users")).find(
          (u) => u.id === c2.user.id,
        );
        ok(await post(admin.token, "user", { ...u, enabled: false }));
        assert.equal((await get(c2.token, "offers")).status, 401);
        ok(await post(admin.token, "user", { ...u, enabled: true }));
      },
    );
    await t.test(
      "Outbox lưu bền vững và worker chạy lại không tạo trùng",
      async () => {
        await tick();
        const count = await one(db, "SELECT COUNT(*) count FROM Notifications");
        await tick();
        const again = await one(db, "SELECT COUNT(*) count FROM Notifications");
        assert(again.count >= count.count);
        const duplicate = await query(
          db,
          "SELECT eventKey,userId,COUNT(*) count FROM Notifications GROUP BY eventKey,userId HAVING COUNT(*)>1",
        );
        assert.equal(duplicate.length, 0);
      },
    );
  } finally {
    await closeDatabase();
  }
});
