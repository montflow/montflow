---
name: typescript-file-structure
description: >-
  Verifies and scaffolds TypeScript source tree structure — colocated tests, .test.ts
  naming, the src/index.ts entry carve-out, and .js index.ts re-export chains. Use when
  auditing, organizing, or creating files/folders in a TypeScript project.
id: 3e9a7c25f8d14b60
author: Daniel Montilla
version: 2.0.0
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
2. **`src/index.ts` is the package/service entry carve-out.** It is the only loose file allowed under `src/`; every other file lives inside a group folder/module. It re-exports the package surface, and it is present in every package.
3. **Every internal folder has an `index.ts`.** Each group folder's `index.ts` re-exports all of its subfolders' public API through their indexes, using `.js` specifiers:

   ```typescript
   // src/utils/index.ts
   export * from "./date-range/index.js";
   export * from "./string-case/index.js";
   ```

4. **Module `index.ts` stays namespace-style.** Inside a module, the existing rule wins: `export * as DateRange from "./date-range.utils.module.js"` (see [typescript-modules](../typescript-modules/SKILL.md)). The wildcard folder-level re-export above only applies to group folders aggregating their subfolders.

# Target Shape

```text
src/
├─ index.ts                          ✅ package entry carve-out
├─ utils/
│  ├─ index.ts                       ✅ export * from "./date-range/index.js"; ...
│  ├─ date-range/
│  │  ├─ index.ts                    ✅ export * as DateRange from "./date-range.utils.module.js"
│  │  ├─ date-range.utils.module.ts
│  │  ├─ CONTEXT.md                  (optional; leaf module)
│  │  └─ tests/
│  │     ├─ index.ts                 ✅ export * from "./parse/index.js" (if nested)
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

List all folders and files under `src/`. Note: folders without `index.ts`, test files outside a module's own `tests/` folder, files missing the `.test.ts` suffix, and any loose file that is not `src/index.ts`.

## 2. Verify Test Colocation

For every `*.test.ts` file, confirm it sits in `tests/` **inside the module whose code it imports** (its import should resolve to `../index.js`). Move any strays into the correct module's `tests/` folder. Confirm every test file name ends in `.test.ts`.

## 3. Verify Index Chain

Walk every folder under `src/` (including `src/` itself):

- `src/index.ts` present as the entry carve-out, re-exporting the package surface.
- Missing internal `index.ts` → create it.
- New subfolder added → append its re-export line to the parent's `index.ts`.

Folder `index.ts` contains one wildcard re-export per subfolder; module `index.ts` keeps its single namespace export.

## 4. Verify Imports Still Resolve

After moving or adding files, run the typecheck/test suite to confirm nothing broke.

# Reference

### Conventions

- Folder names: `kebab-case`, plural group folders (`utils`, `services`, `structs`, `modules`, …), singular modules
- Re-export paths use the `.js` extension (`"./date-range/index.js"`)
- No default exports anywhere in the chain
- Tests never imported by production code — the `tests/` folders are excluded from package entry points

### Related

- **Structure entry point**: [montflow-typescript-project-structure](../montflow-typescript-project-structure/SKILL.md)
- **Module shape**: [typescript-modules](../typescript-modules/SKILL.md)

### Gates

Before completing, run all checks in [GATES.md](GATES.md).
