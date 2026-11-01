import test from "node:test";
import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { createApp } from "../../src/app.js";
import { config } from "../../src/config.js";
import { database, closeDatabase } from "../../src/db.js";

const app = createApp();
const get = (token, path) => request(app).get("/api/" + path).set("Authorization", "Bearer " + token);
const post = (token, action, body, key = randomUUID()) => request(app).post("/api/actions/" + action)
  .set("Authorization", "Bearer " + token).set("Idempotency-Key", key).send(body);
const ok = response => { assert.equal(response.status, 200, JSON.stringify(response.body)); return response.body; };

test("Meal assistants: CRUD, photos, exclusive reservations and checkout service history", async t => {
  assert.match(config.mongo.database, /^StayFlow_\d+Test$/);
  const login = async username => ok(await request(app).post("/api/auth/login").send({ username, password: process.env.DEMO_SEED_PASSWORD }));
  const admin = await login("admin");
  const desk = await login("letan");
  const tag = randomUUID().slice(0, 8);
  const profile = { name: "Người bón " + tag, birthYear: 2000, height: 165, bust: 85, waist: 65, hips: 90, weight: 55, status: "AVAILABLE",
    photo: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9YQAAAAASUVORK5CYII=" };
  let personId, orderId, stayId, otherStayId, serviceId;
  try {
    await t.test("Only admin can manage profiles; special access is required to read", async () => {
      assert.equal((await get(desk.token, "meal-assistants")).status, 403);
      assert.equal((await post(desk.token, "meal-assistant", profile)).status, 403);
      const key = randomUUID();
      personId = ok(await post(admin.token, "meal-assistant", profile, key)).id;
      assert.equal(ok(await post(admin.token, "meal-assistant", profile, key)).id, personId);
      const person = ok(await get(admin.token, "meal-assistants?status=AVAILABLE")).find(row => row.id === personId);
      assert.equal(person.photo, profile.photo);
      assert.equal(person.birthYear, 2000);
      for (const body of [{ ...profile, birthYear: 3000 }, { ...profile, weight: -1 }, { ...profile, photo: "data:image/png;base64,ZmFrZQ==" }, { ...profile, photo: "data:image/svg+xml;base64,PHN2Zz4=" }])
        assert.equal((await post(admin.token, "meal-assistant", body)).status, 400);
      assert.equal((await post(admin.token, "meal-assistant", { ...profile, photo: "data:image/png;base64," + Buffer.alloc(500001).toString("base64") })).status, 400);
      // The profile route accepts a valid image larger than the default JSON limit.
      const padded = Buffer.concat([Buffer.from(profile.photo.split(",")[1], "base64"), Buffer.alloc(40000)]);
      ok(await post(admin.token, "meal-assistant", { ...profile, id: personId, photo: "data:image/png;base64," + padded.toString("base64") }));
      const type = ok(await get(admin.token, "roomTypes"))[0];
      const customer = ok(await get(admin.token, "customers"))[0];
      const newStay = async suffix => {
        const roomId = ok(await post(admin.token, "room", { number: "MEAL-" + tag + suffix, typeId: type.id, zone: "TEST" })).id;
        return ok(await post(desk.token, "checkin", { roomId, customerId: customer.id, guests: 1, mode: "HOUR" })).id;
      };
      stayId = await newStay("A");
      otherStayId = await newStay("B");
      serviceId = ok(await post(admin.token, "special-service", { purpose: "MEAL_ASSISTANCE", name: "Đút thức ăn " + tag, unit: "lượt", price: 50000 })).id;
    });
    const booking = stayId => ({ purpose: "MEAL_ASSISTANCE", stayId, mealAssistantId: personId, items: [{ serviceId, quantity: 1 }] });
    await t.test("Concurrent reservations select one winner and do not double-book", async () => {
      const results = await Promise.all([post(admin.token, "special-request", booking(stayId)), post(admin.token, "special-request", booking(otherStayId))]);
      assert.deepEqual(results.map(result => result.status).sort(), [200, 409]);
      const winner = ok(results.find(result => result.status === 200));
      orderId = winner.id;
      const db = await database();
      const order = await db.db.collection("Orders").findOne({ id: orderId });
      stayId = order.stayId;
      assert.equal(order.mealAssistantName, profile.name);
      assert(!ok(await get(admin.token, "meal-assistants?status=AVAILABLE")).some(person => person.id === personId));
      assert.equal((await post(admin.token, "meal-assistant", { ...profile, id: personId })).status, 409);
      assert.equal((await post(admin.token, "meal-assistant-delete", { id: personId })).status, 409);
      const pending = ok(await get(admin.token, "quote?stayId=" + stayId));
      assert.equal(pending.pendingOrderCount, 1);
      assert.equal(pending.orders.find(order => order.id === orderId).mealAssistantName, profile.name);
      assert.equal((await post(admin.token, "checkout", { stayId, payRemaining: true })).status, 409);
      const limited = ok(await get(desk.token, "quote?stayId=" + stayId));
      assert.equal(limited.pendingOrderCount, 1);
      assert(limited.orders.some(order => order.restricted && order.status === "PENDING"));
      assert(!JSON.stringify(limited).includes(personId));
      assert(!JSON.stringify(limited).includes(profile.name));
      assert(!JSON.stringify(limited).includes(orderId));
    });
    await t.test("Complete from checkout, charge once, release assistant, keep history after deletion", async () => {
      ok(await post(admin.token, "meal-assistant", { ...profile, id: personId, name: "Tên mới " + tag, status: "SERVING" }));
      ok(await post(admin.token, "special-request-status", { id: orderId, status: "PREPARING" }));
      const completed = await Promise.all([post(admin.token, "special-request-status", { id: orderId, status: "COMPLETED" }), post(admin.token, "special-request-status", { id: orderId, status: "COMPLETED" })]);
      completed.forEach(ok);
      assert(ok(await get(admin.token, "meal-assistants?status=AVAILABLE")).some(person => person.id === personId));
      const quote = ok(await get(admin.token, "quote?stayId=" + stayId));
      assert.equal(quote.pendingOrderCount, 0);
      assert.equal(quote.services, 50000);
      assert.equal(quote.items.filter(item => item.orderId === orderId).length, 1);
      assert.equal(quote.orders.find(order => order.id === orderId).mealAssistantName, profile.name);
      const checkout = ok(await post(desk.token, "checkout", { stayId, payRemaining: true }));
      assert.equal(checkout.total, quote.total);
      assert.equal(ok(await get(admin.token, "quote?stayId=" + stayId)).orders.find(order => order.id === orderId).status, "COMPLETED");
      ok(await post(admin.token, "meal-assistant-delete", { id: personId }));
      assert(!ok(await get(admin.token, "meal-assistants")).some(person => person.id === personId));
      assert.equal(ok(await get(admin.token, "quote?stayId=" + stayId)).orders[0].mealAssistantName, profile.name);
    });
    await t.test("Unavailable/deleted people cannot be booked; cancelling releases without charging", async () => {
      // Create an independent open room so this case is unaffected by which reservation won.
      const type = ok(await get(admin.token, "roomTypes"))[0];
      const customer = ok(await get(admin.token, "customers"))[0];
      const roomId = ok(await post(admin.token, "room", { number: "MEAL-" + tag + "C", typeId: type.id, zone: "TEST" })).id;
      const openId = ok(await post(admin.token, "checkin", { roomId, customerId: customer.id, guests: 1, mode: "HOUR" })).id;
      assert.equal((await post(admin.token, "special-request", booking(openId))).status, 409);
      const unavailable = ok(await post(admin.token, "meal-assistant", { ...profile, status: "SERVING" })).id;
      assert.equal((await post(admin.token, "special-request", { ...booking(openId), mealAssistantId: unavailable })).status, 409);
      ok(await post(admin.token, "meal-assistant", { ...profile, id: unavailable, status: "AVAILABLE" }));
      assert.equal((await post(admin.token, "food-order", { stayId: openId, mealAssistantId: unavailable, items: [{ serviceId, quantity: 1 }] })).status, 400);
      assert.equal((await post(admin.token, "special-request", { ...booking(openId), mealAssistantId: unavailable, items: [{ serviceId: randomUUID(), quantity: 1 }] })).status, 409);
      assert(ok(await get(admin.token, "meal-assistants?status=AVAILABLE")).some(person => person.id === unavailable), "Failed order must roll back the assistant reservation");
      const cancelled = ok(await post(admin.token, "special-request", { ...booking(openId), mealAssistantId: unavailable }));
      ok(await post(admin.token, "special-request-status", { id: cancelled.id, status: "CANCELLED" }));
      const quote = ok(await get(admin.token, "quote?stayId=" + openId));
      assert.equal(quote.pendingOrderCount, 0);
      assert.equal(quote.services, 0);
      assert.equal(quote.orders[0].status, "CANCELLED");
      assert(ok(await get(admin.token, "meal-assistants?status=AVAILABLE")).some(person => person.id === unavailable));
      const next = ok(await post(admin.token, "special-request", { ...booking(openId), mealAssistantId: unavailable }));
      ok(await post(admin.token, "special-request-status", { id: cancelled.id, status: "CANCELLED" }));
      assert(!ok(await get(admin.token, "meal-assistants?status=AVAILABLE")).some(person => person.id === unavailable), "A retry of an old cancellation must not release a newer reservation");
      ok(await post(admin.token, "special-request-status", { id: next.id, status: "CANCELLED" }));
      ok(await post(admin.token, "meal-assistant-delete", { id: unavailable }));
    });
  } finally { await closeDatabase(); }
});
