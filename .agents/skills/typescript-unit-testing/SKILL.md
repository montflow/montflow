---
name: typescript-unit-testing
description: TypeScript-specific test infrastructure, directory structure, Vitest configuration, and test-running validation. Depends on unit-testing for language-agnostic fundamentals. Use when setting up tests in a TypeScript monorepo.
id: c56ff98212899a0d
author: Daniel Montilla
version: 1.3.0
license: MIT
groups:
  - testing
  - typescript
dependencies:
  - executing-skills
  - creating-typescript-modules
  - unit-testing
---

# When To Use

Setting up test infrastructure in a TypeScript monorepo. Reviewing test directory structure and naming conventions. Configuring Vitest and ensuring tests can run.

> **Prerequisites**: Load [executing-skills](../executing-skills/SKILL.md) for skill execution, then [unit-testing](../unit-testing/SKILL.md) for language-agnostic test quality review, then return here for TypeScript-specific setup.

# Pipeline

## 1. Verify Directory Structure

### For TypeScript Modules

If the code under test follows the [creating-typescript-modules](../creating-typescript-modules/SKILL.md) convention (`.module.ts` + `index.ts`):

```
src/[category]/[module-name]/
├── [module-name].module.ts
├── index.ts
└── test/
    ├── [module-name].[utility-1].test.ts
    └── [module-name].[utility-2].test.ts
```

- `test/` directory lives **inside** the module directory
- One test file per exported utility/function
- Naming: `[module-name].[utility-name].test.ts`

### For Non-Module Code

```
src/[path/]/
├── file-to-test.ts
└── test/
    └── file-to-test.test.ts
```

- `test/` directory sits **next to** the file being tested
- Must use `test/` — never `__test__` or `tests/`

## 2. Configure Vitest

Create `vitest.config.ts`:

```typescript
import * as Vitest from "vitest/config";

export default Vitest.defineConfig({
  test: {
    include: ["tests/**/*.test.ts", "src/**/*.test.ts"],
  },
});
```

Add `"test": "vitest run"` to the `scripts` section of `package.json`.

## 3. Verify Tests Pass

Run the test suite and confirm all tests pass.

# Reference

- **Test fundamentals**: [unit-testing](../unit-testing/SKILL.md) (MUST READ)
- **Module conventions**: [creating-typescript-modules](../creating-typescript-modules/SKILL.md)
