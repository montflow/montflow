---
name: effect-structs
description: >-
  Creates branded struct modules with validation, blueprint, and brand utilities inside
  the structs/ group. Use when creating a new branded type module.
id: 85949992ca0d93e8
author: Daniel Montilla
version: 3.0.2
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

Use when the user asks to create, scaffold, or add a new branded struct module. Structs live under the `structs/` group and follow the full [typescript-modules](../typescript-modules/SKILL.md) structure, while adding their own required exports (Id, branded type, check, make/makeUnsafe, optional Blueprint). Structs define **branded types** over primitives (`string` or `number`) using Effect's `Brand` module — each struct is a namespace-style module with validation, `make`/`makeUnsafe`, and optional `Blueprint` Schema.

> **Prerequisite**: Load the [executing-skills](../executing-skills/SKILL.md) skill before running this pipeline. It governs how skills are loaded, executed, and verified.

# Pipeline

## 1. Create Module Directory

Create `src/structs/[struct-name]/` (e.g., `src/structs/uuid/`) plus a `CONTEXT.md` and an empty `tests/` folder — full structure per [typescript-modules](../typescript-modules/SKILL.md). Directory name is kebab-case.

## 2. Create Module

Create `[struct-name].structs.module.ts`. Pick the pattern matching the underlying type:

### String brand

See [templates/string.struct.module.ts](templates/string.struct.module.ts) (MUST READ)

Required: `Id` (const + type), `type [Name]` (`string & Brand.Brand<Id>`), `REGEX`, `check`, `makeUnsafe`, `make`, `Blueprint`.

### Number brand

See [templates/number.struct.module.ts](templates/number.struct.module.ts) (MUST READ)

Required: `Id` (const + type), `type [Name]` (`number & Brand.Brand<Id>`), `check`, `makeUnsafe`, `make`, `fromNumber`, `toNumber`, `Blueprint`.

### Composed brand (Brand.all)

See [templates/composed.struct.module.ts](templates/composed.struct.module.ts) (MUST READ)

Required: `Id` (const + type), `make` (via `Brand.all`), `type [Name]` (`Brand.Brand.FromConstructor<typeof make>`), `makeUnsafe`, `Blueprint`.

## 3. Create Index

Create `index.ts` that re-exports the module as a namespace:

```typescript
export * as PascalCase from "./[struct-name].structs.module.ts";
```

## 4. Register in Parent

Update `src/structs/index.ts` (or equivalent aggregator) to re-export:

```typescript
export * from "./[struct-name]/index.ts";
```

# Reference

- **[String Brand Template](templates/string.struct.module.ts)**: Full template for string-backed branded types (MUST READ)
- **[Number Brand Template](templates/number.struct.module.ts)**: Full template for number-backed branded types (MUST READ)
- **[Composed Brand Template](templates/composed.struct.module.ts)**: Full template for Brand.all composition (MUST READ)
- **[Examples](examples/)**: Complete struct implementations with code blocks
  - [examples/document-id.md](examples/document-id.md): DocumentId — 24-char hex string
  - [examples/uuid.md](examples/uuid.md): UUID v4 string with `fromRandom`
  - [examples/int.md](examples/int.md): Int — integer number
  - [examples/positive-int.md](examples/positive-int.md): PositiveInt via `Brand.all` composition
- **[typescript-modules](../typescript-modules/SKILL.md)**: Module structure, naming, and index conventions (MUST READ)
- **[effect-testing](../effect-testing/SKILL.md)**: Test location, imports, and suite naming for the struct's tests
- **[GATES](GATES.md)**: Validation checklist (MUST READ)

## Required Exports

| Export | Type | Purpose |
|--------|------|---------|
| `Id` | `const` | Brand identifier string |
| `Id` | `type` | Type alias for `typeof Id` |
| `type [Name]` | `type` | Branded type (`string & Brand<Id>`, `number & Brand<Id>`, or `Brand.Brand.FromConstructor<typeof make>`) |
| `REGEX` | `const` | Validation regex (string brands only) |
| `check` | `function` | Returns `true` or error string (omit for `Brand.all` composition) |
| `makeUnsafe` | `function` | `Brand.nominal<Name>()` without validation |
| `make` | `function` | `Brand.make<Name>(check)` or `Brand.all(...)` |
| `Blueprint` | `Schema` | Effect Schema via `Schema.*.pipe(Schema.fromBrand(Id, make))` (optional) |

## Optional Utilities

Add per struct type as needed:

- **Number brands**: `fromNumber`, `toNumber`
- **UUID / Slug8**: `fromRandom`, `fromGenerator`
- **IsoDatetime**: `fromDate`, `unsafeFromDate`, `toDate`, `unsafeToDate`, `toDateTime`, `now`
- **IsoDuration**: `fromMillis`, `fromSeconds`, `fromMinutes`, `fromHours`, `fromDays`, `fromWeeks`, `toDuration`
- **StringNumber**: `fromNumber`, `toNumber`, `asNumber`, `zero`
- **PortNumber**: `isValidPort` (type guard)
- **TraceId**: `BrandUtils.checkFromSchema` deriving check from an Effect Schema

## Schema Transformation Structs (database)

`src/structs/` structs define **Schema transformations** between MongoDB type and common struct:

```typescript
import { Schema, SchemaTransformation } from "effect";
import { CommonStruct } from "@pokerbids/common";

export const Blueprint = Schema.instanceOf(MongoType).pipe(
  Schema.decodeTo(
    CommonStruct.Blueprint,
    SchemaTransformation.transform({
      decode: (mongoValue) => mongoValue.toString(),
      encode: (str) => new MongoType(str),
    }),
  ),
  Schema.revealCodec,
);
```

Examples: **ObjectId** ↔ `DocumentId`, **Decimal128** ↔ `StringNumber`, **Date** ↔ `IsoDatetime`.

## Conventions

- File naming: `[name].structs.module.ts` (`structs` group infix per typescript-modules)
- `Id` constant matches struct name (PascalCase)
- `Id` type is `typeof Id`
- `check` returns `true` or error string; accepts `str: string` (string brands) or `num: unknown` (number brands)
- Number brands export `fromNumber`/`toNumber`
- String brands export `REGEX`; number/composed brands omit
- Composed brands use `Brand.all(...)` + `Brand.Brand.FromConstructor<typeof make>` instead of inline type + check
- Some Blueprints use `Schema.revealCodec` (e.g., string-url) when Schema type needs widening
- Some structs omit `Blueprint` entirely (e.g., Email) when only branding + validation needed
- Full `.ts` extension in all relative import/export paths
