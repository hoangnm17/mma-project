const frontendConfig = require("./frontend/eslint.config.js");
const reactVersion = require("./frontend/node_modules/react/package.json").version;
module.exports = [
  ...frontendConfig,
  { settings: { react: { version: reactVersion } } },
  {
    ignores: [
      "**/dist/**",
      "**/.expo/**",
      "artifacts/**",
      "**/node_modules/**",
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
];
