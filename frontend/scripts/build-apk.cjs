/* global __dirname */
const { spawnSync } = require("node:child_process");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const config = require(path.join(root, "eas.json"));
const profile = "preview-cloud";
const env = { ...process.env, ...config.build[profile].env };
const npmCli = process.env.npm_execpath;
const args = [
  "exec",
  "--yes",
  "--package=eas-cli@latest",
  "--call",
  `eas build --platform android --profile ${profile} --clear-cache`,
];
const result = npmCli
  ? spawnSync(process.execPath, [npmCli, ...args], {
      cwd: root,
      env,
      stdio: "inherit",
    })
  : spawnSync(process.platform === "win32" ? "npm.cmd" : "npm", args, {
      cwd: root,
      env,
      stdio: "inherit",
      shell: process.platform === "win32",
    });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
