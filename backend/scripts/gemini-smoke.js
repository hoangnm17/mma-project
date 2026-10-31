import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import request from "supertest";
import { writeFile } from "node:fs/promises";

process.env.MONGO_DATABASE = "StayFlow_" + Date.now() + "Test";
process.env.JWT_SECRET = "gemini-test-only-secret-at-least-32-characters";
process.env.DEMO_SEED_PASSWORD = "GeminiTestOnly!2026";
process.env.AI_PROVIDER = "gemini";
process.env.PUSH_ENABLED = "false";
assert.ok(process.env.GEMINI_API_KEY, "Load your private Gemini env file before this opt-in live test");
const { database, closeDatabase } = await import("../src/db.js");
try {
  const cwd = fileURLToPath(new URL("../", import.meta.url));
  for (const script of ["migrate.js", "seed.js"]) {
    const result = spawnSync(process.execPath, ["scripts/" + script], { cwd, env: process.env, stdio: "inherit", windowsHide: true });
    assert.equal(result.status, 0);
  }
  const { createApp } = await import("../src/app.js");
  const app = createApp();
  const login = await request(app).post("/api/auth/login").send({ username: "admin", password: process.env.DEMO_SEED_PASSWORD });
  assert.equal(login.status, 200);
  const response = await request(app).post("/api/ai/manager").set("Authorization", "Bearer " + login.body.token)
    .send({ question: "Cho tôi xem tổng quan doanh thu và phòng hiện tại của cơ sở" });
  assert.equal(response.status, 200, JSON.stringify(response.body));
  assert.equal(response.body.tool, "dashboard");
  assert.equal(typeof response.body.data.revenue, "number");
  const ctx = await database();
  const quota = await ctx.db.collection("AiUsage").findOne({ actorKey: login.body.user.id });
  assert.equal(quota.calls, 1);
  const result = { provider: "gemini", model: process.env.GEMINI_MODEL || "gemini-3.5-flash-lite", managerHttp: response.status, tool: response.body.tool, quotaCalls: quota.calls };
  await writeFile(new URL("../../artifacts/gemini-live-smoke.json", import.meta.url), JSON.stringify(result, null, 2) + "\n");
  console.log(JSON.stringify(result));
} finally {
  const ctx = await database();
  assert.match(process.env.MONGO_DATABASE, /^StayFlow_\d+Test$/);
  await ctx.db.dropDatabase();
  await closeDatabase();
}
