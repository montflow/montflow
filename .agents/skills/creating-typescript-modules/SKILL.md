---
name: creating-typescript-modules
description: Creates tree-shakable TypeScript modules with namespace-style exports. Use when the user wants to scaffold a new reusable module package.
id: eddcf8fa1555535a
author: Daniel Montilla
version: 1.1.0
license: MIT
dependencies:
  - executing-skills
groups:
  - skills
  - typescript
  - scaffolding
---

# When To Use

Use when the user asks to create, scaffold, or set up a new reusable TypeScript module. Also use when the user needs to organize existing code into a tree-shakable module structure.

> **Prerequisite**: Load the [executing-skills](../executing-skills/SKILL.md) skill before running this pipeline. It governs how skills are loaded, executed, and verified.

# Pipeline

## 1. Create Module Directory

Create `src/[category]/[module-name]/` (e.g., `src/structs/user-id/`).

## 2. Create Module File

Create `[module-name].module.ts` exporting types, functions, and re-exports from internal files:

```typescript
export * from "./sub-module.js";
export const something = () => "value";
```

## 3. Create Index File

Create `index.ts` that re-exports the module as a namespace:

```typescript
export * as ModuleName from "./[module-name].module.js";
```

## 4. Use

Import and consume the namespace:

```typescript
import { ModuleName } from "path/to/index.js";

ModuleName.something();
```

# Reference

### Directory Structure

```
src/[category]/[module-name]/
├── [module-name].module.ts    # Main exports
└── index.ts                   # export * as Name from "./module.js"
```

### Variations

- **Basic**: Single `.module.ts` + `index.ts`
- **Extended**: Multiple internal files + `.module.ts` re-exports them all + `index.ts`

### Conventions

- Use `.js` extension in exports (not `.ts`)
- No TypeScript `namespace` keyword
- Prefer exported functions over static classes
- Use ES module namespace imports instead of wildcard imports
- Module name is singular (e.g., `hook`, not `hooks`)
- Function names must **not** repeat the module name: `make` not `makeHook`, `create` not `createHook`, `parse` not `parseHook` — the namespace already provides context
- Use concise verbs: `make`, `create`, `from`, `to`, `parse`, `validate`

### Gates

Before completing, run all checks in [GATES.md](GATES.md).