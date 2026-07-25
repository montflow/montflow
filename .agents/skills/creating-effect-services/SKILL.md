---
name: creating-effect-services
description: Scaffolds Effect v4 services with ServiceMap.Service pattern. Use when creating a new service in packages/*/src/services/.
id: 8a7c50b11c6c17df
author: Daniel Montilla
version: 1.1.0
dependencies:
  - executing-skills
  - creating-typescript-modules
groups:
  - skills
  - typescript
  - scaffolding
---

# When To Use

Use when the user asks to create, scaffold, or add a new Effect v4 service under `packages/*/src/services/`. The service follows the ServiceMap.Service pattern with required exports (Id, Impl, ServiceName, Default).

> **Prerequisite**: Load the [executing-skills](../executing-skills/SKILL.md) skill before running this pipeline. It governs how skills are loaded, executed, and verified.

# Pipeline

## 1. Create Directory

Create `src/services/[service-name]/` (e.g., `src/services/json/`). The directory name is kebab-case.

## 2. Export Required Identifiers

In `[service-name].module.ts`, export:

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
export * as PascalCase from "./[service-name].module.js";
```

## 5. Register in Parent

Update `src/services/index.ts` to re-export the new service:

```typescript
export * from "./[service-name]/index.js";
```

# Reference

- **[Service Template](templates/service.module.ts)**: Full code template showing all required exports and patterns (MUST READ)
- **[Key Patterns](SKILL.md#key-patterns)**: make effect, as const, Effect.Success, Service class, Default layer
- **[Full Example](examples/json.service.ts)**: Complete service implementation (MUST READ)
- **[Namespace Module Pattern](../creating-typescript-modules/SKILL.md)**: The index.ts namespace re-export convention (MUST READ)

## Key Patterns

- **`make`** (or `makeDefault`): Effect that constructs the service implementation
- **`Impl`**: Type using `Effect.Success<typeof make>` for proper type inference
- **Service class**: `ServiceMap.Service<Self, Impl>()(Id)` — empty body, just extends
- **`Default`**: `Layer.effect(ServiceName, make)` for the default layer

## Directory Structure

```
packages/*/src/services/
├── index.ts                    # exports: export * from "./[service-name]/"
└── [service-name]/
    └── [service-name].module.ts
```

## Naming Conventions

- Directory and file name: kebab-case
- Export namespace: PascalCase
- `Id` value: `@scope/PascalName` (e.g., `@pokerbids/Json`)
- `Id` value after `/` matches the class name