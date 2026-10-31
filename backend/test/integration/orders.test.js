import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { createApp } from "../../src/app.js";
import { config } from "../../src/config.js";
import { database, transaction, closeDatabase } from "../../src/db.js";
import { find, first, update } from "../../src/mongo-store.js";

const app = createApp();
const password = process.env.DEMO_SEED_PASSWORD;
const get = (token, path) =>
  request(app).get("/api/" + path).set("Authorization", "Bearer " + token);
const post = (token, action, body, key = randomUUID()) =>
  request(app)
    .post("/api/actions/" + action)
    .set("Authorization", "Bearer " + token)
    .set("Idempotency-Key", key)
    .send(body);
function ok(response) {
  assert.equal(response.status, 200, JSON.stringify(response.body));
  return response.body;
}
async function login(username, value = password) {
  return ok(
    await request(app)
      .post("/api/auth/login")
      .send({ username, password: value }),
  );
}

test("Food orders and private support use snapshots, strict permissions and one charge", async (t) => {
  assert(config.mongo.database.endsWith("Test"), "Only use a test database");
  const admin = await login("admin");
  const desk = await login("letan");
  const cleaner = await login("cleaner1");
  const tag = randomUUID().slice(0, 8);
  const username = "orders-desk-" + tag;
  const helperId = ok(
    await post(admin.token, "user", {
      username,
      name: "Nhân viên hỗ trợ " + tag,
      role: "Receptionist",
      password: "OrderTestOnly!2026",
      canAccessSpecialServices: true,
    }),
  ).id;
  const helper = await login(username, "OrderTestOnly!2026");
  const types = ok(await get(admin.token, "roomTypes"));
  const customers = ok(await get(admin.token, "customers"));
  const roomId = ok(
    await post(admin.token, "room", {
      number: "ORDER-" + tag,
      typeId: types[0].id,
      zone: "TEST",
    }),
  ).id;
  const stayId = ok(
    await post(desk.token, "checkin", {
      roomId,
      customerId: customers[0].id,
      guests: 1,
      mode: "HOUR",
    }),
  ).id;
  const food = {
    name: "Cháo " + tag,
    unit: "tô",
    price: 30000,
    enabled: true,
  };
  const foodId = ok(await post(admin.token, "food-item", food)).id;
  const mealId = ok(
    await post(admin.token, "special-service", {
      purpose: "MEAL_ASSISTANCE",
      name: "Hỗ trợ ăn uống " + tag,
      unit: "lượt",
      price: 50000,
    }),
  ).id;
  const privateName = "Hỗ trợ riêng " + tag;
  const privateId = ok(
    await post(admin.token, "special-service", {
      purpose: "PRIVATE_SUPPORT",
      name: privateName,
      unit: "lượt",
      price: 100000,
    }),
  ).id;
  const db = await database();
  let orderId;
  try {
    await t.test("Normal catalogues and actions cannot expose hidden support", async () => {
      const normal = ok(await get(desk.token, "services"));
      assert(!normal.some((item) => [foodId, mealId, privateId].includes(item.id)));
      assert.equal((await get(desk.token, "special-services?purpose=PRIVATE_SUPPORT")).status, 403);
      assert.equal((await get(desk.token, "special-requests?purpose=PRIVATE_SUPPORT")).status, 403);
      assert.equal((await get(cleaner.token, "food-orders")).status, 403);
      assert.equal((await post(desk.token, "food-item", food)).status, 403);
      assert.equal(
        (await post(desk.token, "special-request", {
          purpose: "PRIVATE_SUPPORT", stayId, items: [{ serviceId: privateId, quantity: 1 }],
        })).status,
        403,
      );
      assert.equal(
        (await post(desk.token, "food-order", { stayId, items: [{ serviceId: privateId, quantity: 1 }] })).status,
        409,
      );
      assert.equal(
        (await post(desk.token, "serviceItem", { stayId, serviceId: privateId, quantity: 1 })).status,
        403,
      );
      const genericEdit = await post(admin.token, "service", {
        id: privateId, code: "PRIVATE_EDIT", name: "Leaked", unit: "lượt", price: 0,
      });
      assert(genericEdit.status >= 400);
    });

    await t.test("Food order is idempotent and blocks checkout until resolved", async () => {
      const body = { stayId, items: [{ serviceId: foodId, quantity: 2, notes: "Ít muối" }], notes: "Giao tại phòng" };
      const key = randomUUID();
      const firstOrder = ok(await post(desk.token, "food-order", body, key));
      orderId = firstOrder.id;
      assert.equal(firstOrder.total, 60000);
      assert.equal(ok(await post(desk.token, "food-order", body, key)).id, orderId);
      const checkout = await post(admin.token, "checkout", { stayId, allowDebt: true, reason: "Chưa thu tiền kiểm thử" });
      assert.equal(checkout.status, 409);
      assert.match(checkout.body.error, /đơn dịch vụ/);
      assert.equal((await find(db, "StayServiceItems", { orderId })).length, 0);
      assert.equal((await first(db, "Stays", { id: stayId })).status, "OPEN");
      assert.equal((await find(db, "Receipts", { stayId })).length, 0);
    });

    await t.test("Completion preserves quoted price and charges once across retries", async () => {
      ok(await post(admin.token, "food-item", { ...food, id: foodId, price: 99000 }));
      ok(await post(desk.token, "food-order-status", { id: orderId, status: "PREPARING" }));
      const checkout = await post(admin.token, "checkout", { stayId, allowDebt: true, reason: "Chưa thu tiền kiểm thử" });
      assert.equal(checkout.status, 409);
      assert.match(checkout.body.error, /đơn dịch vụ/);
      assert.equal((await first(db, "Stays", { id: stayId })).status, "OPEN");
      assert.equal((await find(db, "Receipts", { stayId })).length, 0);
      const results = await Promise.all([
        post(desk.token, "food-order-status", { id: orderId, status: "COMPLETED" }),
        post(desk.token, "food-order-status", { id: orderId, status: "COMPLETED" }),
      ]);
      results.forEach(ok);
      const lines = await find(db, "StayServiceItems", { orderId });
      assert.equal(lines.length, 1);
      assert.equal(lines[0].unitPrice, 30000);
      assert.equal(lines[0].quantity, 2);
      assert.equal(lines[0].category, "FOOD");
      assert.equal((await post(desk.token, "food-order-status", { id: orderId, status: "CANCELLED" })).status, 409);
      assert.equal((await post(desk.token, "serviceItem", { stayId, serviceId: foodId, itemId: lines[0].id, quantity: 10 })).status, 403);
    });

    await t.test("Cancelled orders charge nothing and cannot be completed", async () => {
      const cancelledId = ok(await post(desk.token, "food-order", { stayId, items: [{ serviceId: foodId, quantity: 1 }] })).id;
      ok(await post(desk.token, "food-order-status", { id: cancelledId, status: "CANCELLED" }));
      assert.equal((await post(desk.token, "food-order-status", { id: cancelledId, status: "COMPLETED" })).status, 409);
      assert.equal((await find(db, "StayServiceItems", { orderId: cancelledId })).length, 0);
    });

    await t.test("Private calling and meal assistance are separate scoped queues", async () => {
      const mealMenu = ok(await get(helper.token, "special-services?purpose=MEAL_ASSISTANCE"));
      const privateMenu = ok(await get(helper.token, "special-services?purpose=PRIVATE_SUPPORT"));
      assert(mealMenu.some((item) => item.id === mealId));
      assert(!mealMenu.some((item) => item.id === privateId));
      assert(privateMenu.some((item) => item.id === privateId));
      assert.equal((await post(helper.token, "special-request", { purpose: "MEAL_ASSISTANCE", stayId, items: [{ serviceId: privateId, quantity: 1 }] })).status, 409);
      const privateOrder = ok(await post(helper.token, "special-request", { purpose: "PRIVATE_SUPPORT", stayId, items: [{ serviceId: privateId, quantity: 1 }], notes: "Hỗ trợ riêng tại phòng" }));
      const privateOrders = ok(await get(helper.token, "special-requests?purpose=PRIVATE_SUPPORT"));
      assert(privateOrders.some((order) => order.id === privateOrder.id));
      assert(!ok(await get(helper.token, "special-requests?purpose=MEAL_ASSISTANCE")).some((order) => order.id === privateOrder.id));
      const deskNotices = await find(db, "Notifications", { userId: desk.user.id, eventKey: { $regex: privateOrder.id } });
      assert.equal(deskNotices.length, 0);
      const helperNotices = await find(db, "Notifications", { userId: helperId, eventKey: { $regex: privateOrder.id } });
      assert.equal(helperNotices.length, 1);
      assert(helperNotices[0].eventKey.startsWith("special:"));
      ok(await post(helper.token, "special-request-status", { id: privateOrder.id, status: "PREPARING" }));
      ok(await post(helper.token, "special-request-status", { id: privateOrder.id, status: "COMPLETED" }));
      const normalQuote = ok(await get(desk.token, "quote?stayId=" + stayId));
      assert(!JSON.stringify(normalQuote).includes(privateName));
      const privilegedQuote = ok(await get(helper.token, "quote?stayId=" + stayId));
      assert(JSON.stringify(privilegedQuote).includes(privateName));
      await transaction((tx) => update(tx, "Users", { id: helperId }, { $set: { canAccessSpecialServices: false } }));
      assert.equal((await get(helper.token, "special-requests?purpose=PRIVATE_SUPPORT")).status, 403);
      assert(!ok(await get(helper.token, "notifications")).some((notice) => notice.eventKey.startsWith("special:")));
    });

    await t.test("Guests cannot read or create staff orders", async () => {
      const link = ok(await post(desk.token, "guest-link", { stayId }));
      const token = new URL(link.url).hash.slice(7);
      const guest = ok(await request(app).post("/api/guest-access/exchange").send({ token }));
      assert.equal((await get(guest.token, "food-items")).status, 403);
      assert.equal((await get(guest.token, "special-services?purpose=PRIVATE_SUPPORT")).status, 403);
      assert.equal((await post(guest.token, "food-order", { stayId, items: [{ serviceId: foodId, quantity: 1 }] })).status, 403);
      const stay = await first(db, "Stays", { id: stayId });
      assert.equal(stay.status, "OPEN");
    });
  } finally {
    await closeDatabase();
  }
});
