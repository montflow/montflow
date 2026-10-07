---
name: effect-services
description: >-
  Scaffolds Effect v4 services with Context.Service pattern inside the services/
  group. Use when creating a new Effect service module.
id: 8a7c50b11c6c17df
author: Daniel Montilla
version: 3.0.0
dependencies:
  - executing-skills
  - typescript-modules
groups:
  - effect
  - skills
  - typescript
  - scaffolding
---

# When To Use

Use when the user asks to create, scaffold, or add a new Effect v4 service module. Services are Effect-flavored modules: they live under the `services/` group and follow the full [typescript-modules](../typescript-modules/SKILL.md) structure, while keeping their own required exports (Id, Impl, ServiceName, Default).

> **Prerequisite**: Load the [executing-skills](../executing-skills/SKILL.md) skill before running this pipeline. It governs how skills are loaded, executed, and verified.

# Pipeline

## 1. Create Module Directory

Create `src/services/[service-name]/` (e.g., `src/services/json/`) plus an empty `tests/` folder, and a `CONTEXT.md` only when the module is a leaf and needs one — full structure per [typescript-modules](../typescript-modules/SKILL.md). The directory name is kebab-case.

## 2. Export Required Identifiers

In `[service-name].services.module.ts`, export:

- **`Id`** — string identifier `@montflow/PascalName` (const + type)
- **`Impl`** — inferred from the make effect via `Effect.Success<typeof make>`
- **`ServiceName`** — class extending `Context.Service<ServiceName, Impl>()(Id)` with empty body
- **`Default`** — `Layer.effect(ServiceName, make)` for the default layer

### Id

```typescript
export const Id = "@montflow/ServiceName";
export type Id = typeof Id;
```

The `Id` value after `/` matches the class name (`@montflow/Json` ↔ `class Json`).

### Impl

```typescript
export type Impl = Effect.Success<typeof make>;
```

### Service class

```typescript
export class ServiceName extends Context.Service<ServiceName, Impl>()(Id) {}
```

### Default layer

```typescript
export const Default = Layer.effect(ServiceName, make);
```

## 3. Implement Service

### Create make effect

Use `Effect.gen(function* () { ... })` or `Effect.sync(...)`. Return the implementation object with `as const` for literal type inference.

```typescript
const make = Effect.gen(function* () {
  return {
    // methods
  } as const;
});
```

### Add errors (optional)

Define errors as `Data.TaggedError` classes.

```typescript
export class ParseError extends Data.TaggedError("@montflow/JsonParseError")<{
  error: SyntaxError;
}> {}
```

### Test layers live in the module

A service module keeps its layers next to `Default` so its surface stays self-contained. Build a layer that must provide one or more services with `Layer.effectContext(effect)`, where `effect` yields a `Context.Context`:

```typescript
import { Context, Effect, Layer } from "effect";

const makeTest = Effect.gen(function* () {
  return {
    // stubbed methods
  } as const;
});

/** Test layer built from a stubbed implementation. */
export const Test = Layer.effectContext(
  Effect.map(makeTest, (impl) => Context.make(ServiceName, impl)),
);
```

## 4. Create Index

Create `index.ts` that re-exports the module file via namespace, using a `.js` specifier:

```typescript
export * as PascalCase from "./[service-name].services.module.js";
```

## 5. Register in Parent

Update `src/services/index.ts` to re-export the new service:

```typescript
export * from "./[service-name]/index.js";
```

# Reference

- **[Service Template](templates/service.module.ts)**: Full code template showing all required exports and patterns (MUST READ)
- **[Key Patterns](SKILL.md#key-patterns)**: make effect, as const, Effect.Success, Context.Service, Default layer
- **[Full Example](examples/json.service.ts)**: Complete service implementation (MUST READ)
- **[typescript-modules](../typescript-modules/SKILL.md)**: Module structure, naming, and index conventions (MUST READ)
- **[effect-testing](../effect-testing/SKILL.md)**: Test location, imports, and suite naming for the service's tests

## Key Patterns

- **`make`** (or `makeDefault`): Effect that constructs the service implementation
- **`Impl`**: Type using `Effect.Success<typeof make>` for proper type inference
- **Service class**: `Context.Service<Self, Impl>()(Id)` — empty body, just extends
- **`Default`**: `Layer.effect(ServiceName, make)` for the default layer
- **Test layers**: alongside `Default`, built with `Layer.effectContext`

## Directory Structure

```
src/services/
├─ index.ts                                  # export * from "./[service-name]/index.js"
└─ [service-name]/
   ├─ index.ts                               # export * as PascalName from "./[service-name].services.module.js"
   ├─ [service-name].services.module.ts      # Id, Impl, ServiceName, Default + implementation
   ├─ CONTEXT.md                             # optional; leaf modules only
   └─ tests/
      └─ [utility-name].test.ts
```

## Naming Conventions

- Directory and file name: kebab-case
- Export namespace: PascalCase
- `Id` value: `@montflow/PascalName` (e.g., `@montflow/Json`)
- `Id` value after `/` matches the class name

### Related

- **Structure entry point**: [montflow-typescript-project-structure](../montflow-typescript-project-structure/SKILL.md)
