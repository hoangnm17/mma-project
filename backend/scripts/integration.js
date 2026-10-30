import { spawnSync } from "node:child_process";
import sql from "mssql";
import { config } from "../src/config.js";
// Never reset the user's database. Each run owns exactly this temporary database.
const testDatabase = "StayFlow_" + Date.now() + "Test";
const env = {
  ...process.env,
  SQL_DATABASE: testDatabase,
  OPENAI_API_KEY: "",
  PUSH_ENABLED: "false",
};
let result = 0;
try {
  for (const args of [
    ["scripts/migrate.js"],
    ["scripts/seed.js"],
    ["--test", "test/integration/workflow.test.js"],
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
  const master = await new sql.ConnectionPool({
    ...config.sql,
    database: "master",
  }).connect();
  await master
    .request()
    .query(
      `IF DB_ID('${testDatabase}') IS NOT NULL BEGIN ALTER DATABASE [${testDatabase}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [${testDatabase}]; END`,
    );
  await master.close();
}
process.exitCode = result;
