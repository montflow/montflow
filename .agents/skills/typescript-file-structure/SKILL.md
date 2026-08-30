---
name: typescript-file-structure
description: >-
  Verifies and scaffolds TypeScript source tree structure — colocated tests, .test.ts
  naming, and index.ts re-export chains for every folder. Use when auditing, organizing,
  or creating files/folders in a TypeScript project.
id: 3e9a7c25f8d14b60
author: Daniel Montilla
version: 1.0.1
license: MIT
dependencies:
  - executing-skills
  - typescript-modules
  - effect-testing
groups:
  - skills
  - typescript
  - structure
---

# When To Use

Use when creating new folders or files in a TypeScript project, when auditing whether an existing source tree follows the project structure rules, or when fixing misplaced tests or missing `index.ts` re-exports. Module internals are governed by [typescript-modules](../typescript-modules/SKILL.md) and test content by [effect-testing](../effect-testing/SKILL.md) — this skill governs **where everything sits and how folders connect**.

> **Prerequisite**: Load the [executing-skills](../executing-skills/SKILL.md) skill before running this pipeline. It governs how skills are loaded, executed, and verified.

# Core Rules

1. **Tests are colocated with what they test.** A test file lives in `tests/` inside the same module as the code under test — never in a top-level or sibling test folder. Every test file name ends in `.test.ts`.
2. **Every folder has an `index.ts`** — except `src/` itself. Each folder's `index.ts` re-exports all of its subfolders' public API through their indexes:

   ```typescript
   // src/utils/index.ts
   export * from "./date-range/index.ts";
   export * from "./string-case/index.ts";
   ```

3. **Module `index.ts` stays namespace-style.** Inside a module, the existing rule wins: `export * as DateRange from "./date-range.utils.module.ts"` (see [typescript-modules](../typescript-modules/SKILL.md)). The wildcard folder-level re-export above only applies to group folders aggregating their subfolders.

# Target Shape

```text
src/
├─ index.ts                          ❌ none — src/ is exempt
├─ utils/
│  ├─ index.ts                       ✅ export * from "./date-range/index.ts"; ...
│  ├─ date-range/
│  │  ├─ index.ts                    ✅ export * as DateRange from "./date-range.utils.module.ts"
│  │  ├─ date-range.utils.module.ts
│  │  ├─ CONTEXT.md
│  │  └─ tests/
│  │     ├─ index.ts                 ✅ export * from "./parse/index.ts" (if nested)
│  │     └─ parse.test.ts            ✅ colocated + .test.ts suffix
│  └─ string-case/
│     └─ ...
├─ services/
│  ├─ index.ts                       ✅ re-exports each service module's index
│  └─ user-account/
│     └─ ...
└─ modules/
   └─ ...
```

# Pipeline

## 1. Map the Source Tree

List all folders and files under `src/`. Note: folders without `index.ts`, test files outside a module's own `tests/` folder, and files missing the `.test.ts` suffix.

## 2. Verify Test Colocation

For every `*.test.ts` file, confirm it sits in `tests/` **inside the module whose code it imports** (its import should resolve to `../index.ts`). Move any strays into the correct module's `tests/` folder. Confirm every test file name ends in `.test.ts`.

## 3. Verify Index Chain

Walk every folder under `src/` (excluding `src/` itself):

- Missing `index.ts` → create it.
- New subfolder added → append its re-export line to the parent's `index.ts`.

Folder `index.ts` contains one wildcard re-export per subfolder; module `index.ts` keeps its single namespace export.

## 4. Verify Imports Still Resolve

After moving or adding files, run the typecheck/test suite to confirm nothing broke.

# Reference

### Conventions

- Folder names: `kebab-case`, plural groups (`utils`, `services`, `layers`, `modules`), singular modules
- Re-export paths include the full `.ts` extension (`"./date-range/index.ts"`)
- No default exports anywhere in the chain
- Tests never imported by production code — the `tests/` folders are excluded from package entry points

### Gates

Before completing, run all checks in [GATES.md](GATES.md).
