/* global __dirname */
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

// Run on the target host. Never print generated secrets or overwrite an existing env.
const [domain, mode = "production"] = process.argv.slice(2);
if (
  !domain ||
  domain.length > 253 ||
  !domain.includes(".") ||
  !domain
    .split(".")
    .every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label)) ||
  /^\d+(\.\d+){3}$/.test(domain) ||
  !["demo", "production"].includes(mode)
) {
  throw Error(
    "Usage: node scripts/prepare-cloud-env.cjs api.your-domain.com [demo|production]",
  );
}
const secret = () => `Sf9!${crypto.randomBytes(24).toString("hex")}`;
const values = {
  DOMAIN: domain.toLowerCase(),
  SQL_DATABASE: "StayFlow",
  SQL_PASSWORD: secret(),
  APP_SQL_PASSWORD: secret(),
  JWT_SECRET: crypto.randomBytes(48).toString("hex"),
  PUSH_ENABLED: "false",
  OPENAI_API_KEY: "",
  OPENAI_MODEL: "gpt-4.1-mini",
  AI_DAILY_LIMIT: "30",
  DEMO_SEED_PASSWORD: mode === "demo" ? secret() : "",
  BOOTSTRAP_ADMIN_USERNAME: "admin",
  BOOTSTRAP_ADMIN_PASSWORD: secret(),
};
const target = path.resolve(__dirname, "../deploy/.env");
fs.writeFileSync(
  target,
  Object.entries(values)
    .map(([key, value]) => `${key}=${value}\n`)
    .join(""),
  {
    flag: "wx",
    mode: 0o600,
  },
);
console.log(
  `Created ${target} (${mode}). Secrets were not printed. Keep this file private.`,
);
