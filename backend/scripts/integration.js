import { spawnSync } from "node:child_process";
import { MongoClient } from "mongodb";
import { config } from "../src/config.js";
const testDatabase = "StayFlow_" + Date.now() + "Test";
const env = {
  ...process.env,
  MONGO_DATABASE: testDatabase,
  DEMO_SEED_PASSWORD: "IntegrationOnly!2026",
  JWT_SECRET: "integration-only-secret-with-at-least-32-characters",
  OPENAI_API_KEY: "",
  GEMINI_API_KEY: "",
  AI_PROVIDER: "",
  PUSH_ENABLED: "false",
};
let result = 0;
try {
  for (const args of [
    ["scripts/migrate.js"],
    ["scripts/seed.js"],
    ["scripts/migrate.js"],
    [
      "--test",
      "test/integration/workflow.test.js",
      "test/integration/mongo.test.js",
      "test/integration/hotel-requirements.test.js",
      "test/integration/orders.test.js",
      "test/integration/meal-assistants.test.js",
      "test/integration/requirements.test.js",
      "test/integration/seed-demo.test.js",
      "test/integration/seed-history.test.js",
      "test/integration/initialize.test.js",
      "test/integration/ai-http.test.js",
    ],
  ]) {
    const run = spawnSync(process.execPath, args, { env, stdio: "inherit" });
    if (run.status !== 0) {
      result = run.status || 1;
      break;
    }
  }
} finally {
  if (!/^StayFlow_\d+Test$/.test(testDatabase))
    throw Error("Unsafe test database name");
  const client = new MongoClient(config.mongo.uri);
  try {
    await client.connect();
    await client.db(testDatabase).dropDatabase();
  } finally {
    await client.close();
  }
}
process.exitCode = result;
