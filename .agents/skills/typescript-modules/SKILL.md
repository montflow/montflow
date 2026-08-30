---
name: typescript-modules
description: >-
  Creates tree-shakable TypeScript modules with namespace-style exports, organized
  into group folders. Use when the user wants to scaffold a new module, organize code
  into modules, or verify module structure and naming conventions.
id: eddcf8fa1555535a
author: Daniel Montilla
version: 2.1.1
license: MIT
dependencies:
  - executing-skills
  - effect-testing
groups:
  - skills
  - typescript
  - scaffolding
---

# When To Use

Use when the user asks to create, scaffold, or set up a new reusable TypeScript module. Also use when the user needs to organize existing code into a tree-shakable module structure.

> **Prerequisite**: Load the [executing-skills](../executing-skills/SKILL.md) skill before running this pipeline. It governs how skills are loaded, executed, and verified.

# Core Rules

1. **Everything is scoped using modules.** All exported code lives inside a module (a `[module-name].module.ts` file re-exported through an `index.ts`). No loose top-level exports.
2. **Modules are never loose.** Every module lives inside a group folder: `modules/`, `utils/`, `services/`, or `layers/`.
3. **One canonical structure per module** (see below). File names are `kebab-case`; export names are `PascalCase`.

# Directory Structure

```
[group]/
├─ [module-name]/
│  ├─ index.ts
│  ├─ [module-name].[group].module.ts
│  ├─ CONTEXT.md
│  └─ tests/
│     └─ [module-util-name].test.ts
```

- **Group**: one of `modules`, `utils`, `services`, `layers`.
- **Exception**: when the group is `modules`, the module file is named `[module-name].module.ts` (no group infix).

Examples:

```
src/
├─ modules/
│  └─ user-account/
│     ├─ index.ts
│     ├─ user-account.module.ts        # group is "modules" → no infix
│     ├─ CONTEXT.md
│     └─ tests/
│        └─ parse.test.ts
├─ utils/
│  └─ date-range/
│     ├─ index.ts
│     ├─ date-range.utils.module.ts    # group infix for non-"modules" groups
│     ├─ CONTEXT.md
│     └─ tests/
│        └─ parse.test.ts
```

### Test Naming

Test files live in `tests/` and are named after the util/function under test: `[module-util-name].test.ts`. One test file per unit of behavior, not one giant file per module. Test style, suite naming, and structure come from [effect-testing](../effect-testing/SKILL.md).

# Pipeline

## 1. Pick Group and Module Name

Choose the group (`modules/`, `utils/`, `services/`, `layers/`) and a singular kebab-case module name (e.g., `user-account`, not `user-accounts`).

## 2. Create Module Directory

Create `src/[group]/[module-name]/` plus an empty `tests/` folder and a `CONTEXT.md` (see below).

## 3. Create Module File

Create `[module-name].[group].module.ts` (or `[module-name].module.ts` when group is `modules`). All code is declared directly in this file — no submodule files:

```typescript
export const something = () => "value";
```

## 4. Create Index File

Create `index.ts` that re-exports the module as a namespace. The alias is the PascalCase form of the module name:

```typescript
// src/utils/date-range/index.ts
export * as DateRange from "./date-range.utils.module.ts";
```

```typescript
// src/modules/user-account/index.ts
export * as UserAccount from "./user-account.module.ts";
```

## 5. Use

Import and consume the namespace:

```typescript
import { DateRange } from "path/to/index.js";

DateRange.something();
```

# Reference

### CONTEXT.md

A short doc at the root of each module answering: what this module is for, what belongs in it (and what does not), and any non-obvious constraints or dependencies. Keep it brief — it exists so agents and humans can decide in seconds whether to extend this module or create a new one.

### Module Style

Define exported methods as arrow-function consts:

```typescript
// inside auth.module.ts
export const login = (credentials: Credentials) => { /* ... */ };
export const logout = () => { /* ... */ };
```

**No-Echo Rule (strong suggestion)**: utility names do not repeat the module name — the namespace already provides context. In `auth.module.ts`, write `login`, not `authLogin`, so callers get `Auth.login`. The same applies with a verb: `make`, not `makeAuth` or `authMake`.

```typescript
// ❌ echoes the module name — Auth.authLogin reads redundant
export const authLogin = (credentials: Credentials) => { /* ... */ };

// ✅ clean at the call site: Auth.login(...)
export const login = (credentials: Credentials) => { /* ... */ };
```

This is a strong default, not a hard rule. Occasionally echoing is correct — e.g., when the module name would otherwise be ambiguous at the call site (`DateRange.parseDate` vs a bare `parse`) or when avoiding a reserved/conflicting word. Deviate deliberately, never accidentally.

### Conventions

- File names are `kebab-case`; export aliases are `PascalCase` (`date-range` → `DateRange`)
- Import/export paths include the full `.ts` extension (e.g., `"./date-range.utils.module.ts"`)
- No TypeScript `namespace` keyword
- Prefer exported functions over static classes
- Use ES module namespace imports instead of wildcard imports
- Module name is singular (e.g., `hook`, not `hooks`)
- Follow the **No-Echo Rule**: function names do not repeat the module name (`login` not `authLogin`, `make` not `makeHook`) — unless there is a deliberate reason to echo (see [Module Style](#module-style))
- Use concise verbs: `make`, `create`, `from`, `to`, `parse`, `validate`

### Gates

Before completing, run all checks in [GATES.md](GATES.md).
