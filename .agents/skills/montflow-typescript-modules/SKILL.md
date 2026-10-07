---
name: montflow-typescript-modules
description: >-
  Creates tree-shakable TypeScript modules with namespace-style exports, organized
  into open-ended group folders. Use when the user wants to scaffold a new module,
  organize code into modules, or verify module structure and naming conventions.
id: eddcf8fa1555535a
author: Daniel Montilla
version: 4.0.0
license: MIT
dependencies:
  - executing-skills
  - montflow-typescript-testing
groups:
  - skills
  - typescript
  - scaffolding
---

# When To Use

Use when the user asks to create, scaffold, or set up a new reusable TypeScript module. Also use when the user needs to organize existing code into a tree-shakable module structure.

> **Prerequisite**: Load the [executing-skills](../executing-skills/SKILL.md) skill before running this pipeline. It governs how skills are loaded, executed, and verified.

# Core Rules

1. **Everything is scoped using modules.** All exported code lives inside a module (a `[module-name].module.ts` file re-exported through an `index.ts`). No loose top-level exports — the one exception is the package/service entry `src/index.ts`, which is owned by [montflow-typescript-file-structure](../montflow-typescript-file-structure/SKILL.md).
2. **Modules are never loose.** Every module lives inside a group folder. Groups are open-ended plural folders — observed examples include `modules/`, `utils/`, `services/`, `structs/`, `components/`, `rules/`, and `shared/`. The registry is not closed: choose a plural group that fits, do not reach for a fixed list.
3. **One canonical structure per module** (see below). File names are `kebab-case`; export names are `PascalCase`.

# Directory Structure

```
[group]/
├─ [module-name]/
│  ├─ index.ts
│  ├─ [module-name].[group].module.ts
│  ├─ CONTEXT.md                         # optional; leaf modules only
│  └─ tests/
│     └─ [module-util-name].test.ts
```

- **Group**: any plural group folder (e.g. `modules`, `utils`, `services`, `structs`, `components`, `rules`, `shared`).
- **Entry**: the package/service `src/index.ts` is the only loose file allowed under `src/`; every other file lives in a group folder/module ([montflow-typescript-file-structure](../montflow-typescript-file-structure/SKILL.md)).
- **Exception**: when the group is `modules`, the module file is named `[module-name].module.ts` (no group infix).
- **`CONTEXT.md` is optional.** Add it for leaf modules that need a short "what belongs here" doc; omit it otherwise. Group folders carry none.

Examples:

```
src/
├─ modules/
│  └─ user-account/
│     ├─ index.ts
│     ├─ user-account.module.ts        # group is "modules" → no infix
│     └─ tests/
│        └─ parse.test.ts
├─ utils/
│  └─ date-range/
│     ├─ index.ts
│     ├─ date-range.utils.module.ts    # group infix for non-"modules" groups
│     ├─ CONTEXT.md                    # optional
│     └─ tests/
│        └─ parse.test.ts
```

### Test Naming

Test files live in `tests/` and are named after the util/function under test: `[module-util-name].test.ts`. One test file per unit of behavior, not one giant file per module. Test style, suite naming, and structure come from [montflow-typescript-testing](../montflow-typescript-testing/SKILL.md).

# Pipeline

## 1. Pick Group and Module Name

Choose a plural group folder and a singular kebab-case module name (e.g., `user-account`, not `user-accounts`).

## 2. Create Module Directory

Create `src/[group]/[module-name]/` plus an empty `tests/` folder. Add `CONTEXT.md` only when the module is a leaf and needs a "belongs here / does not belong here" doc (see below).

## 3. Create Module File

Create `[module-name].[group].module.ts` (or `[module-name].module.ts` when group is `modules`). All code is declared directly in this file — no submodule files:

```typescript
export const something = () => "value";
```

## 4. Create Index File

Create `index.ts` that re-exports the module as a namespace. The alias is the PascalCase form of the module name, and the specifier uses `.js`:

```typescript
// src/utils/date-range/index.ts
export * as DateRange from "./date-range.utils.module.js";
```

```typescript
// src/modules/user-account/index.ts
export * as UserAccount from "./user-account.module.js";
```

## 5. Use

Import and consume the namespace:

```typescript
import { DateRange } from "path/to/index.js";

DateRange.something();
```

# Reference

### CONTEXT.md

Optional, and only at the root of a leaf module. It answers: what this module is for, what belongs in it (and what does not), and any non-obvious constraints or dependencies. Keep it brief — it exists so agents and humans can decide in seconds whether to extend this module or create a new one. Template:

```markdown
# <Module name>

<One-paragraph purpose: what this module is for.>

## Belongs here

- <Concern this module owns.>

## Does not belong here

- <Concern owned elsewhere.>
```

Group folders carry no `CONTEXT.md`; only leaf modules may have one.

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
- Import/export paths use the `.js` extension (e.g., `"./date-range.utils.module.js"`)
- Exported and public-API functions use explicit return types; internal functions infer
- No TypeScript `namespace` keyword
- Prefer exported functions over static classes
- Use ES module namespace imports instead of wildcard imports
- Module name is singular (e.g., `hook`, not `hooks`)
- Follow the **No-Echo Rule**: function names do not repeat the module name (`login` not `authLogin`, `make` not `makeHook`) — unless there is a deliberate reason to echo (see [Module Style](#module-style))
- Use concise verbs: `make`, `create`, `from`, `to`, `parse`, `validate`

### Related

- **Structure entry point**: [montflow-typescript-project-structure](../montflow-typescript-project-structure/SKILL.md)
- **Tree layout**: [montflow-typescript-file-structure](../montflow-typescript-file-structure/SKILL.md)

### Gates

Before completing, run all checks in [GATES.md](GATES.md).
