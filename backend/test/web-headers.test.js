import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import request from "supertest";
import { createApp } from "../src/app.js";

test("Static web permits Expo hydration without allowing arbitrary inline scripts", async () => {
  const previous = process.env.WEB_DIST;
  try {
    process.env.WEB_DIST = fileURLToPath(new URL("./fixtures/web/", import.meta.url));
    const response = await request(createApp()).get("/");
    assert.equal(response.status, 200);
    assert.match(response.text, /__EXPO_ROUTER_HYDRATE__/);
    const policy = response.headers["content-security-policy"];
    assert.ok(policy.includes("'sha256-67fhrP0+BkBqmgGGXTtgiVO/9EQs3QruYNU/7fnRkI8='"));
    const scripts = policy.split(";").find(part => part.startsWith("script-src "));
    assert.ok(scripts.includes("'self'"));
    assert.ok(!scripts.includes("'unsafe-inline'"));
  } finally {
    if (previous === undefined) delete process.env.WEB_DIST;
    else process.env.WEB_DIST = previous;
  }
});
