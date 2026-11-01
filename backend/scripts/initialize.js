import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { database, closeDatabase } from "../src/db.js";
import { demoSeedState, seedDemo } from "./seed-demo.js";
import { seedHistory } from "./seed-history.js";

const directory = fileURLToPath(new URL("../", import.meta.url));
let stage = "configuration";
try {
  const mode = (process.env.DEMO_AUTO_SEED || "true").toLowerCase();
  if (!["true", "false"].includes(mode)) throw Error("DEMO_AUTO_SEED phải là true hoặc false");
  for (const script of ["migrate.js", "provision-runtime.js", "bootstrap-admin.js"]) {
    stage = script;
    console.log("Initialize:", script);
    const run = spawnSync(process.execPath, ["scripts/" + script], { cwd: directory, env: process.env, stdio: ["ignore", "pipe", "pipe"], encoding: "utf8", windowsHide: true });
    if (run.error) throw run.error;
    if (run.status !== 0) throw Error((run.stderr || run.stdout || `Script kết thúc với mã ${run.status}`).trim());
    if (run.stdout.trim()) console.log(run.stdout.trim());
  }
  stage = "demo eligibility";
  if (mode === "false") console.log("Demo seed disabled; migration/bootstrap completed.");
  else {
    const state = await demoSeedState(await database());
    if (!state.eligible) console.log("Giữ dữ liệu hiện có; bỏ qua seed demo:", state.reason);
    else {
      stage = "seed-demo.js";
      const password = process.env.DEMO_SEED_PASSWORD || process.env.BOOTSTRAP_ADMIN_PASSWORD;
      console.log("Demo base:", JSON.stringify(await seedDemo(password)));
      stage = "seed-history.js";
      const history = await seedHistory({ onProgress: ({ day, days }) => console.log(`Demo history ${day}/${days}`) });
      console.log("Demo history:", JSON.stringify(history));
    }
  }
  console.log("Initialization completed; API can start.");
} catch (error) {
  let message = error.message || "Unknown initialization failure";
  for (const [key, value] of Object.entries(process.env)) {
    if (/PASSWORD|SECRET|TOKEN|API_KEY|MONGO.*URI/.test(key) && value?.length >= 8) message = message.split(value).join("[REDACTED]");
  }
  message = message.replace(/mongodb(\+srv)?:\/\/[^\s@]+@/g, "mongodb$1://[REDACTED]@");
  console.error(`Initialization failed at ${stage}: ${message}`);
  process.exitCode = 1;
} finally {
  await closeDatabase();
}
