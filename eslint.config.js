const { defineConfig } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");
module.exports = defineConfig([
  expoConfig,
  {
    ignores: [
      "dist/**",
      "artifacts/**",
      "backend/node_modules/**",
      "node_modules/**",
    ],
  },
  {
    files: ["backend/**/*.js"],
    languageOptions: {
      sourceType: "module",
      globals: {
        process: "readonly",
        console: "readonly",
        fetch: "readonly",
        AbortSignal: "readonly",
        URL: "readonly",
      },
    },
    rules: { "import/no-unresolved": "off" },
  },
]);
