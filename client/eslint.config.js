// eslint flat config. self-contained (no @eslint/js or globals package) so
// `npm run lint` works through npx without adding runtime dependencies.

const browser = {
  window: "readonly", document: "readonly", location: "readonly", navigator: "readonly",
  localStorage: "readonly", sessionStorage: "readonly", fetch: "readonly", URL: "readonly",
  URLSearchParams: "readonly", Intl: "readonly", console: "readonly", setTimeout: "readonly",
  clearTimeout: "readonly", setInterval: "readonly", clearInterval: "readonly", Blob: "readonly",
  HTMLElement: "readonly", Response: "readonly",
};

const rules = {
  // possible bugs
  "no-undef": "error",
  "no-unused-vars": ["error", { args: "after-used", caughtErrors: "none" }],
  "no-dupe-keys": "error",
  "no-unreachable": "error",
  "no-self-compare": "error",
  "no-template-curly-in-string": "warn",
  "no-unsafe-finally": "error",
  "no-fallthrough": "error",
  "require-atomic-updates": "off",
  "eqeqeq": ["error", "always"],
  // style / maintainability
  "no-var": "error",
  "prefer-const": "error",
  "no-alert": "error",
  "no-console": ["warn", { allow: ["error"] }],
  "complexity": ["warn", 10],
  "max-lines-per-function": ["warn", { max: 80, skipBlankLines: true, skipComments: true }],
  "max-depth": ["warn", 3],
  "no-duplicate-imports": "error",
  "camelcase": ["error", { properties: "never" }],
};

export default [
  { ignores: ["css/**", "node_modules/**"] },
  {
    files: ["js/**/*.js"],
    languageOptions: { ecmaVersion: 2024, sourceType: "module", globals: browser },
    rules,
  },
  {
    files: ["test/**/*.js", "eslint.config.js"],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: "module",
      globals: { ...browser, globalThis: "readonly", process: "readonly" },
    },
    rules: { ...rules, "max-lines-per-function": "off" },
  },
];
