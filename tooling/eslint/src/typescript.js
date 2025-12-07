import base from "./base.js";

/** @type {import('eslint').Linter.Config} */
export default {
  ...base,
  languageOptions: {
    ...base.languageOptions,
    parserOptions: {
      ...base.languageOptions.parserOptions,
      project: "./tsconfig.json",
    },
  },
  rules: {
    ...base.rules,
    "@typescript-eslint/no-floating-promises": "error",
    "@typescript-eslint/await-thenable": "error",
    "@typescript-eslint/no-misused-promises": "error",
    "@typescript-eslint/prefer-nullish-coalescing": "error",
    "@typescript-eslint/prefer-optional-chain": "error",
    "@typescript-eslint/strict-boolean-expressions": "off",
  },
};
