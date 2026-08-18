import typescript from "@montflow/eslint/typescript";
import prettierConfig from "@montflow/eslint/prettier";

/** @type {import('eslint').Linter.Config[]} */
export default [
  {
    ...typescript,
    languageOptions: {
      ...typescript.languageOptions,
      parserOptions: {
        ...typescript.languageOptions.parserOptions,
        project: "./tsconfig.eslint.json",
      },
    },
    rules: {
      ...typescript.rules,
      "@typescript-eslint/no-explicit-any": "off",
      "sort-imports": [
        "warn",
        {
          ignoreCase: true,
          ignoreDeclarationSort: true,
          ignoreMemberSort: true,
          memberSyntaxSortOrder: ["all", "single", "multiple", "none"],
          allowSeparatedGroups: true,
        },
      ],
    },
  },
  prettierConfig,
  {
    ignores: ["build/**", "node_modules/**"],
  },
];

