/* global __dirname */
const { spawnSync } = require("node:child_process");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const frontend = path.join(root, "frontend");
const env = { ...process.env, EXPO_PUBLIC_API_URL: "http://127.0.0.1:4011" };
const commands = [
  { cwd: frontend, args: ["node_modules/expo/bin/cli", "export", "--platform", "web", "--clear", "--max-workers", "1", "--output-dir", path.join(root, "artifacts/ui-web")] },
  { cwd: root, args: ["backend/scripts/test-local-mongo.js", "--ui"] },
];
for (const { args, cwd } of commands) {
  const result = spawnSync(process.execPath, args, { cwd, env, stdio: "inherit", windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) { process.exitCode = result.status || 1; break; }
}
