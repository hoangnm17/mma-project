import { spawn } from "node:child_process";
import { mkdir, open } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MongoClient } from "mongodb";

// Isolated local replica set. Never connects to the configured demo/cloud DB.
const backend = fileURLToPath(new URL("../", import.meta.url));
const root = path.resolve(backend, "..");
const directory = path.join(root, "artifacts", "integration-mongo", String(Date.now()));
const port = 27037;
const uri = `mongodb://127.0.0.1:${port}/?directConnection=true`;
const binary = process.env.MONGOD_BINARY || (process.platform === "win32"
  ? "C:/Program Files/MongoDB/Server/8.2/bin/mongod.exe" : "mongod");
await mkdir(directory, { recursive: true });
const log = await open(path.join(directory, "process.log"), "a");
const mongo = spawn(binary, ["--dbpath", directory, "--port", String(port),
  "--replSet", "stayflow-test", "--bind_ip", "127.0.0.1", "--wiredTigerCacheSizeGB", "0.25"],
{ windowsHide: true, stdio: ["ignore", log.fd, log.fd] });
let startupError;
mongo.on("error", error => { startupError = error; });
const client = new MongoClient(uri, { serverSelectionTimeoutMS: 1000 });
try {
  for (let attempt = 0; ; attempt++) {
    if (startupError) throw startupError;
    if (mongo.exitCode !== null) throw Error(`MongoDB exited ${mongo.exitCode}; see ${directory}`);
    try { await client.connect(); break; }
    catch (error) { if (attempt >= 15) throw error; await new Promise(resolve => setTimeout(resolve, 300)); }
  }
  // This process owns this new dbpath. Refuse to initialize some other MongoDB.
  const options = await client.db("admin").command({ getCmdLineOpts: 1 });
  if (path.resolve(options.parsed.storage.dbPath) !== path.resolve(directory)) throw Error("Test MongoDB ownership check failed");
  await client.db("admin").command({ replSetInitiate: { _id: "stayflow-test", members: [{ _id: 0, host: `127.0.0.1:${port}` }] } });
  for (let attempt = 0; ; attempt++) {
    if ((await client.db("admin").command({ hello: 1 })).isWritablePrimary) break;
    if (attempt >= 80) throw Error("Test replica set did not elect a primary");
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  console.log("Local MongoDB replica set ready on port", port);
  await client.close();
  const script = process.argv.includes("--ui") ? "scripts/ui-smoke.js" : process.argv.includes("--gemini") ? "scripts/gemini-smoke.js" : "scripts/integration.js";
  const runner = spawn(process.execPath, [script], { cwd: backend, windowsHide: true,
    stdio: "inherit", env: { ...process.env, MONGO_URI: uri, MONGO_POOL_SIZE: "5" } });
  process.exitCode = await new Promise((resolve, reject) => { runner.on("error", reject); runner.on("exit", code => resolve(code ?? 1)); });
} finally {
  await client.close();
  if (mongo.pid && mongo.exitCode === null) {
    const exited = new Promise(resolve => mongo.once("exit", resolve));
    mongo.kill();
    await exited;
  }
  await log.close();
}
