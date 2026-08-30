---
name: effect-services
description: >-
  Scaffolds Effect v4 services with ServiceMap.Service pattern inside the services/
  group. Use when creating a new Effect service module.
id: 8a7c50b11c6c17df
author: Daniel Montilla
version: 2.0.2
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

Create `src/services/[service-name]/` (e.g., `src/services/json/`) plus a `CONTEXT.md` and an empty `tests/` folder — full structure per [typescript-modules](../typescript-modules/SKILL.md). The directory name is kebab-case.

## 2. Export Required Identifiers

In `[service-name].services.module.ts`, export:

- **`Id`** — string identifier `@scope/PascalName` (const + type)
- **`Impl`** — inferred from make effect via `Effect.Success<typeof make>`
- **`ServiceName`** — class extending `ServiceMap.Service<ServiceName, Impl>()(Id)` with empty body
- **`Default`** — `Layer.effect(ServiceName, make)` for the default layer

### Id

```typescript
export const Id = "@org/ServiceName";
export type Id = typeof Id;
```

### Impl

```typescript
export type Impl = Effect.Success<typeof make>;
```

### Service class

```typescript
export class ServiceName extends ServiceMap.Service<ServiceName, Impl>()(Id) {}
```

### Default layer

```typescript
export const Default = Layer.effect(ServiceName, make);
```

## 3. Implement Service

### Create make effect

Use `Effect.gen(function* () { ... })` or `Effect.sync(...)`. Return implementation object with `as const` for literal type inference.

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
export class ParseError extends Data.TaggedError("@Json/ParseError")<{
  error: SyntaxError;
}> {}
```

## 4. Create Index

Create `index.ts` that re-exports the module file via namespace:

```typescript
export * as PascalCase from "./[service-name].services.module.ts";
```

## 5. Register in Parent

Update `src/services/index.ts` to re-export the new service:

```typescript
export * from "./[service-name]/index.ts";
```

# Reference

- **[Service Template](templates/service.module.ts)**: Full code template showing all required exports and patterns (MUST READ)
- **[Key Patterns](SKILL.md#key-patterns)**: make effect, as const, Effect.Success, Service class, Default layer
- **[Full Example](examples/json.service.ts)**: Complete service implementation (MUST READ)
- **[typescript-modules](../typescript-modules/SKILL.md)**: Module structure, naming, and index conventions (MUST READ)
- **[effect-testing](../effect-testing/SKILL.md)**: Test location, imports, and suite naming for the service's tests

## Key Patterns

- **`make`** (or `makeDefault`): Effect that constructs the service implementation
- **`Impl`**: Type using `Effect.Success<typeof make>` for proper type inference
- **Service class**: `ServiceMap.Service<Self, Impl>()(Id)` — empty body, just extends
- **`Default`**: `Layer.effect(ServiceName, make)` for the default layer

## Directory Structure

```
src/services/
├─ index.ts                                  # export * from "./[service-name]/index.ts"
└─ [service-name]/
   ├─ index.ts                               # export * as PascalName from "./[service-name].services.module.ts"
   ├─ [service-name].services.module.ts      # Id, Impl, ServiceName, Default + implementation
   ├─ CONTEXT.md
   └─ tests/
      └─ [utility-name].test.ts
```

## Naming Conventions

- Directory and file name: kebab-case
- Export namespace: PascalCase
- `Id` value: `@scope/PascalName` (e.g., `@pokerbids/Json`)
- `Id` value after `/` matches the class name