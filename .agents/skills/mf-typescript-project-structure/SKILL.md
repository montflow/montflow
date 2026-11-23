---
name: mf-typescript-project-structure
description: >-
  Canonical entry point for how a montflow TypeScript project is structured:
  everything is a module, module style, group layout, package and service
  scaffolding, exports, and verification — delegating every concrete rule to
  its owning skill. Use when structuring, scaffolding, or auditing a package,
  service, group, or module.
id: 19088d58133341e3
author: Daniel Montilla
version: 3.1.0
license: MIT
groups:
  - typescript
dependencies:
  - executing-skills
  - mimicking-conventions
  - mf-typescript-file-structure
  - mf-typescript-modules
  - mf-typescript-package-setup
  - mf-typescript-services
  - mf-typescript-structs
  - mf-typescript-testing
  - effect
  - typescript-prefer-inference
---

# When To Use

Use when structuring, scaffolding, or auditing a montflow TypeScript package,
service, group, or module — deciding where a file, type, or test belongs, laying
out a new package, or checking an existing tree. This is the single entry point:
it states the module law as principles and names the owning skill for every
concrete rule instead of restating it.

> **Prerequisite**: Load the [executing-skills](../executing-skills/SKILL.md)
> skill before running this pipeline. It governs how skills are loaded,
> executed, and verified.

# Pipeline

## 1. Load the executor and mirror conventions first

Load [executing-skills](../executing-skills/SKILL.md), then
[mimicking-conventions](../mimicking-conventions/SKILL.md) — read the proximity
neighbours and analogous modules before writing anything new.

## 2. Classify the target

Decide package, service, or module, and whether the work is Effect-based or
plain.

## 3. Package/service shell and tooling

Scaffold the shell with
[mf-typescript-package-setup](../mf-typescript-package-setup/SKILL.md). Apply the
`src/index.ts` entry carve-out (module law 1).

## 4. Tree layout

Lay out the group folders, colocated tests, index chain, and `.js` relative
specifiers with
[mf-typescript-file-structure](../mf-typescript-file-structure/SKILL.md).

## 5. Module unit

Define the module — implementation, `index.ts`, optional `CONTEXT.md`, tests —
with [mf-typescript-modules](../mf-typescript-modules/SKILL.md) (module law 2).

## 6. Branch by target

- Effect service → [mf-typescript-services](../mf-typescript-services/SKILL.md).
- Branded value → [mf-typescript-structs](../mf-typescript-structs/SKILL.md).
- Effect API surface → [effect](../effect/SKILL.md).
- Plain module signatures →
  [typescript-prefer-inference](../typescript-prefer-inference/SKILL.md);
  fallible plain code throws typed errors (module law 8).

## 7. Tests

Write tests with [mf-typescript-testing](../mf-typescript-testing/SKILL.md), colocated inside
the module (module law 3). That skill owns test authoring, including the
separation between the test author and the implementer.

## 8. Lenses

Design lenses, referenced not restated: `applying-solid` then
`favoring-composition`. Cleanup lenses: `detecting-duplication` then
`simplifying-code` then `leaving-it-cleaner`. Documentation, only if asked and
then minimally: `writing-jsdoc`.

## 9. Verify

Run the package scripts named in `AGENTS.md` (module law 9).

# Reference

## The module law

Principles only. Each concrete rule is owned by a dependency and must not be
restated here.

1. **Everything is a module** — every export lives inside a module; the only
   loose file is a package/service entry `src/index.ts`.
   *Owner: [mf-typescript-modules](../mf-typescript-modules/SKILL.md).*
2. **One canonical module style** — implementation plus its colocated tests,
   `CONTEXT.md` when the module needs it, and an `index.ts`.
   *Owner: [mf-typescript-modules](../mf-typescript-modules/SKILL.md).*
3. **Tests live inside the module**, colocated with the code they test.
   *Owner: [mf-typescript-file-structure](../mf-typescript-file-structure/SKILL.md).*
4. **`CONTEXT.md` is conditional** and applies to leaf modules only.
   *Owner: [mf-typescript-modules](../mf-typescript-modules/SKILL.md).*
5. **Exports flow through the module `index.ts`** — named exports in the module
   file, the module `index.ts` presents the surface, group `index.ts` files
   aggregate their children. *Owner:
   [mf-typescript-modules](../mf-typescript-modules/SKILL.md) and
   [mf-typescript-file-structure](../mf-typescript-file-structure/SKILL.md).*
6. **Everything lives in a group folder** — groups are open-ended plural
   folders (registry below). No owning skill; this is a policy decision.
7. **Relative specifiers use `.js`** — applies across every dependency.
8. **Routing** — Effect errors split by boundary: `Data.TaggedError` for
   internal errors, `Schema.TaggedError` at serialization boundaries; plain
   modules throw typed error classes. No `Result`. *Owner:
   [effect](../effect/SKILL.md) (API) and
   [mf-typescript-services](../mf-typescript-services/SKILL.md)
   (house pattern).*
9. **Verification** — package scripts named in `AGENTS.md`.

## Group registry

Open-ended plural folders observed in the tree: `utils`, `modules`, `services`,
`structs`, `components`, `rules`, `shared`, `widgets`, `apps`, `skills`.
`layers/` is retired and `structs/` is official. The list is illustrative, not
closed.

## Resolved decisions

Pointers only; each rule is owned by the named skill.

| Decision | Outcome | Owner |
| --- | --- | --- |
| Entry carve-out | `src/index.ts` is the only loose file | [mf-typescript-file-structure](../mf-typescript-file-structure/SKILL.md) |
| Test location | colocated inside the module | [mf-typescript-file-structure](../mf-typescript-file-structure/SKILL.md) |
| Test author | separate from the implementer | [mf-typescript-testing](../mf-typescript-testing/SKILL.md) |
| `CONTEXT.md` | optional, leaf modules only | [mf-typescript-modules](../mf-typescript-modules/SKILL.md) |
| Relative specifiers | `.js` | [mf-typescript-modules](../mf-typescript-modules/SKILL.md) |
| Return types | explicit on exported/public API; infer internally | [typescript-prefer-inference](../typescript-prefer-inference/SKILL.md) |
| Service tag | `Context.Service` | [mf-typescript-services](../mf-typescript-services/SKILL.md) |
| Error model | split: `Data.TaggedError` internal, `Schema.TaggedError` boundary | [effect](../effect/SKILL.md) / [mf-typescript-services](../mf-typescript-services/SKILL.md) |
| `Blueprint` | optional | [mf-typescript-structs](../mf-typescript-structs/SKILL.md) |
| JSDoc | optional and minimal | [writing-jsdoc](../writing-jsdoc/SKILL.md) |
| `Result` type | not part of the contract | — |

## Naming vocabulary

Module, group, file, and test naming are owned by
[mf-typescript-modules](../mf-typescript-modules/SKILL.md) and
[mf-typescript-file-structure](../mf-typescript-file-structure/SKILL.md); this skill
does not restate them.

## Dependency map (consult order)

`executing-skills` → `mimicking-conventions` → structural owners
([mf-typescript-file-structure](../mf-typescript-file-structure/SKILL.md),
[mf-typescript-modules](../mf-typescript-modules/SKILL.md),
[mf-typescript-package-setup](../mf-typescript-package-setup/SKILL.md)) → Effect owners
([mf-typescript-services](../mf-typescript-services/SKILL.md),
[mf-typescript-structs](../mf-typescript-structs/SKILL.md),
[mf-typescript-testing](../mf-typescript-testing/SKILL.md),
[effect](../effect/SKILL.md)) →
[typescript-prefer-inference](../typescript-prefer-inference/SKILL.md).

## Lenses (referenced, not dependencies)

[applying-solid](../applying-solid/SKILL.md),
[favoring-composition](../favoring-composition/SKILL.md),
[detecting-duplication](../detecting-duplication/SKILL.md),
[simplifying-code](../simplifying-code/SKILL.md),
[leaving-it-cleaner](../leaving-it-cleaner/SKILL.md); optional
[writing-jsdoc](../writing-jsdoc/SKILL.md).

## Scope

Structure only — layout, naming, groups, packages, exports, and verification.
Runtime behavior and test content stay with their owning skills.
