import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { createApp } from "../../src/app.js";
import { database, closeDatabase } from "../../src/db.js";
import { config } from "../../src/config.js";
test("Desk cleaning needs no shift and cannot skip the checklist", async () => {
  assert.match(config.mongo.database, /^StayFlow_\d+Test$/);
  const app = createApp();
  const login = await request(app).post("/api/auth/login").send({ username: "admin", password: process.env.DEMO_SEED_PASSWORD });
  assert.equal(login.status, 200);
  const token = login.body.token;
  const post = (action, body) => request(app).post("/api/actions/" + action).set("Authorization", "Bearer " + token).set("Idempotency-Key", randomUUID()).send(body);
  const ok = r => { assert.equal(r.status, 200, JSON.stringify(r.body)); return r.body; };
  try {
    const db = await database();
    for (const mode of ["HOUR", "NIGHT"]) {
      const start = new Date(Date.now() + 48 * 3600000).toISOString();
      const available = await request(app).get("/api/availability").query({ start, mode }).set("Authorization", "Bearer " + token);
      assert.equal(available.status, 200, JSON.stringify(available.body));
      assert.ok(Array.isArray(available.body));
    }
    const type = await db.db.collection("RoomTypes").findOne({});
    const room = ok(await post("room", { number: "CLEAN-" + randomUUID().slice(0, 8), typeId: type.id, zone: "test" }));
    const stay = ok(await post("checkin", { roomId: room.id, customer: { name: "Cleaning Test", phone: "0981122334" }, mode: "HOUR", guests: 1 }));
    ok(await post("checkout", { stayId: stay.id, payRemaining: true, paymentMethod: "CASH" }));
    const task = await db.db.collection("HousekeepingTasks").findOne({ stayId: stay.id, source: "CHECKOUT" });
    assert.ok(task);
    assert.equal((await post("task-desk-complete", { taskId: task.id, checklist: [] })).status, 409);
    ok(await post("task-desk-start", { taskId: task.id }));
    assert.equal((await db.db.collection("Rooms").findOne({ id: room.id })).cleanState, "CLEANING");
    assert.equal((await post("task-desk-complete", { taskId: task.id, checklist: [] })).status, 400);
    const body = { taskId: task.id, checklist: JSON.parse(task.checklistJson) };
    ok(await post("task-desk-complete", body));
    ok(await post("task-desk-complete", body));
    assert.equal((await db.db.collection("Rooms").findOne({ id: room.id })).cleanState, "CLEAN");
    const completed = await db.db.collection("HousekeepingTasks").findOne({ id: task.id });
    assert.equal(completed.completedBy, login.body.user.id);
    assert.ok(completed.completedAt);
  } finally { await closeDatabase(); }
});
