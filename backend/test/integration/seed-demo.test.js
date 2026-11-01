import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { MongoClient } from "mongodb";
import bcrypt from "bcryptjs";
import { config } from "../../src/config.js";

test("Current demo seed preserves bootstrap admin, is atomic/idempotent and refuses existing business data", async () => {
  const databaseName = `StayFlow_${Date.now()}SeedTest`;
  assert.match(databaseName, /^StayFlow_\d+SeedTest$/);
  const client = new MongoClient(config.mongo.uri);
  const env = { ...process.env, MONGO_DATABASE: databaseName, BOOTSTRAP_ADMIN_USERNAME: "letan",
    BOOTSTRAP_ADMIN_PASSWORD: "BootstrapTestOnly!2026", DEMO_SEED_PASSWORD: "SeedTestOnly!2026" };
  const run = script => spawnSync(process.execPath, ["scripts/" + script], { env, encoding: "utf8", windowsHide: true });
  const ok = script => { const result = run(script); assert.equal(result.status, 0, result.stdout + result.stderr); return result.stdout; };
  try {
    await client.connect();
    const db = client.db(databaseName);
    ok("migrate.js");
    ok("bootstrap-admin.js");
    const original = await db.collection("Users").findOne({});
    // Preexisting business data must prevent partial fixture writes.
    const existingType = { id: "existing-type", name: "Preserved", capacity: 2, rateJson: "{}" };
    await db.collection("RoomTypes").insertOne(existingType);
    assert.equal(run("seed-demo.js").status, 1);
    assert.equal(await db.collection("Users").countDocuments(), 1);
    assert.equal(await db.collection("Rooms").countDocuments(), 0);
    assert.equal(await db.collection("AuditLogs").countDocuments({ action: "demo.seed.v2" }), 0);
    await db.collection("RoomTypes").deleteOne({ id: existingType.id });
    const result = JSON.parse(ok("seed-demo.js"));
    assert.equal(result.adminPreserved, true);
    const admin = await db.collection("Users").findOne({ id: original.id });
    assert.equal(admin.passwordHash, original.passwordHash);
    assert.equal(admin.authVersion, original.authVersion);
    assert.equal(admin.username, "letan");
    assert.equal(await db.collection("Users").countDocuments({ username: "letan_demo", role: "Receptionist" }), 1);
    assert.equal(await db.collection("Users").countDocuments({ role: "Cleaner" }), 0);
    assert.equal(await db.collection("Users").countDocuments({ role: "Receptionist" }), 2);
    assert.equal(await db.collection("Stays").countDocuments({ mode: "DAY" }), 0);
    for (const [collection, count] of [["Rooms", 20], ["RoomTypes", 3], ["Customers", 6], ["Bookings", 3], ["Stays", 4], ["Orders", 3], ["HousekeepingTasks", 3], ["Invoices", 1], ["Receipts", 2]]) {
      assert.equal(await db.collection(collection).countDocuments(), count, collection);
    }
    const completed = await db.collection("Orders").findOne({ status: "COMPLETED" });
    assert.equal(await db.collection("StayServiceItems").countDocuments({ orderId: completed.id }), 1);
    const invoice = await db.collection("Invoices").findOne({});
    assert.ok(invoice.total > 0);
    const snapshot = async () => {
      const result = {};
      for (const { name } of await db.listCollections().toArray()) {
        if (name !== "PropertyMutex") result[name] = await db.collection(name).find().sort({ _id: 1 }).toArray();
      }
      return result;
    };
    const before = await snapshot();
    assert.deepEqual(JSON.parse(ok("seed-demo.js")), { skipped: true });
    assert.deepEqual(await snapshot(), before);
    // Without its completion marker the populated DB is rejected, never merged/reset.
    await db.collection("AuditLogs").deleteOne({ action: "demo.seed.v2" });
    const populated = await snapshot();
    assert.equal(run("seed-demo.js").status, 1);
    assert.deepEqual(await snapshot(), populated);

    // Exercise a fresh install too: only this test owns this temporary database.
    await db.dropDatabase();
    ok("migrate.js");
    assert.equal(JSON.parse(ok("seed-demo.js")).adminPreserved, false);
    const newAdmin = await db.collection("Users").findOne({ username: "admin" });
    assert.equal(newAdmin.role, "Admin");
    assert.ok(await bcrypt.compare(env.DEMO_SEED_PASSWORD, newAdmin.passwordHash));
    assert.equal(await db.collection("Rooms").countDocuments(), 20);
  } finally {
    await client.db(databaseName).dropDatabase();
    await client.close();
  }
});
