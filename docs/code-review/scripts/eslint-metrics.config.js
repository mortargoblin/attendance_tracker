// ESLint config used only to measure the frontend for the static code review
// (docs/code-review/). Thresholds are 0/1 so ESLint reports a value for every
// function instead of only the ones over a limit. Run via collect_metrics.py.
export default [
  {
    files: ["**/*.js"],
    languageOptions: { ecmaVersion: "latest", sourceType: "module" },
    rules: {
      complexity: ["warn", 0],
      "max-lines-per-function": ["warn", { max: 1, skipBlankLines: false, skipComments: false }],
      "max-statements": ["warn", 0],
    },
  },
];
