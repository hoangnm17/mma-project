import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { MongoClient } from "mongodb";
import bcrypt from "bcryptjs";
import { config } from "../../src/config.js";
import { database, closeDatabase } from "../../src/db.js";

test("Deployment initializes migration, custom Admin and 60-day seed; restarts preserve data and runtime auth targets the selected DB", async () => {
  const name = `StayFlow_${Date.now()}StartupTest`;
  assert.match(name, /^StayFlow_\d+StartupTest$/);
  const original = { ...config.mongo };
  const client = new MongoClient(original.uri);
  const env = { ...process.env, MONGO_DATABASE: name, MONGO_ADMIN_URI: original.uri,
    MONGO_APP_USER: "stayflow_app", MONGO_APP_PASSWORD: "StartupRuntimeOnly!2026",
    BOOTSTRAP_ADMIN_USERNAME: "letan", BOOTSTRAP_ADMIN_PASSWORD: "StartupAdminOnly!2026",
    DEMO_SEED_PASSWORD: "", DEMO_AUTO_SEED: "true" };
  const run = (extra = {}) => spawnSync(process.execPath, ["scripts/initialize.js"], { env: { ...env, ...extra }, encoding: "utf8", windowsHide: true });
  const ok = (extra) => {
    const result = run(extra);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    return result.stdout;
  };
  try {
    await client.connect();
    const db = client.db(name);
    assert.match(ok({ DEMO_AUTO_SEED: "false" }), /Demo seed disabled/);
    const admin = await db.collection("Users").findOne({ role: "Admin" });
    assert.equal(admin.username, "letan");
    assert(await bcrypt.compare(env.BOOTSTRAP_ADMIN_PASSWORD, admin.passwordHash));
    assert.equal(await db.collection("Rooms").countDocuments(), 0);
    // Same startup command now enables the seed on the already bootstrapped DB.
    assert.match(ok(), /Demo history 60\/60/);
    assert.equal(await db.collection("Rooms").countDocuments(), 20);
    assert.equal(await db.collection("Customers").countDocuments(), 46);
    assert.equal(await db.collection("Users").countDocuments({ username: "letan_demo" }), 1);
    assert.deepEqual(await db.collection("Users").findOne({ id: admin.id }), admin);
    assert.equal(await db.collection("AuditLogs").countDocuments({ action: "demo.history.60d.v1" }), 1);
    const snapshot = async () => {
      const result = {};
      for (const { name } of await db.listCollections().toArray()) {
        if (name !== "PropertyMutex") result[name] = await db.collection(name).find().sort({ _id: 1 }).toArray();
      }
      return result;
    };
    const before = await snapshot();
    assert.match(ok(), /"skipped":true/);
    assert.deepEqual(await snapshot(), before);

    // A mismatched authSource in an existing URI must not keep the API on the old
    // auth database after MONGO_DATABASE changes in Compose.
    const uri = new URL(original.uri);
    uri.username = env.MONGO_APP_USER;
    uri.password = env.MONGO_APP_PASSWORD;
    uri.searchParams.set("authSource", "WrongOldDatabase");
    const wrong = new MongoClient(uri.toString(), { serverSelectionTimeoutMS: 3000 });
    try { await assert.rejects(wrong.connect(), error => error.code === 18); }
    finally { await wrong.close(); }
    config.mongo.uri = uri.toString();
    config.mongo.database = name;
    config.mongo.authDatabase = name;
    const runtime = await database();
    assert.equal(await runtime.db.collection("Rooms").countDocuments(), 20);
    await closeDatabase();

    // Existing business data without our marker is left untouched by auto seed.
    await db.collection("AuditLogs").deleteMany({ action: /^demo\./ });
    const existing = await snapshot();
    assert.match(ok(), /bỏ qua seed demo/);
    assert.deepEqual(await snapshot(), existing);
    assert.equal(run({ DEMO_AUTO_SEED: "invalid" }).status, 1);
  } finally {
    await closeDatabase();
    Object.assign(config.mongo, original);
    await client.db(name).dropDatabase();
    await client.close();
  }
});
