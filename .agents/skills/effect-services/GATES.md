# Gates

End-of-process validation checks for Effect v4 services.

## Phase 0: Directory & File Structure

- [ ] Directory exists at `packages/*/src/services/[service-name]/`
- [ ] `index.ts` exists with `export * as PascalName from "./[service-name].module.js"`
- [ ] `[service-name].module.ts` exists (kebab-case, `.module.ts` suffix)
- [ ] File name matches directory name

## Phase 1: Required Exports

- [ ] `export const Id = "@org/ServiceName"` — string identifier present
- [ ] `export type Id = typeof Id` — branded type present
- [ ] `export type Impl = Effect.Success<typeof make>` — inferred from make effect
- [ ] `export class ServiceName extends ServiceMap.Service<ServiceName, Impl>()(Id) {}` — empty body, no methods
- [ ] `export const Default = Layer.effect(ServiceName, make)` — default layer present (omit if only custom layers)

## Phase 2: Style & Patterns

- [ ] `make` (or `makeDefault`) uses `Effect.gen(function* () { ... })` or `Effect.sync(...)`
- [ ] Implementation object returned with `as const` for literal type inference
- [ ] `Impl` uses `Effect.Success<typeof make>` — no manual type duplication
- [ ] Service class has no class body, no constructor, no methods
- [ ] Errors are `Data.TaggedError` classes (if applicable)
- [ ] No TypeScript `namespace` keyword used
- [ ] `.js` extension in all relative import paths (not `.ts`)
- [ ] Imports use namespace-style where conventional: `import * as X from "..."`

## Phase 3: Naming & Registration

- [ ] Export namespace matches `PascalCase` version of service name
- [ ] `Id` value uses `@scope/PascalName` format (e.g., `@pokerbids/Json`)
- [ ] `Id` value after `/` matches the class name
- [ ] Parent `src/services/index.ts` re-exports this service: `export * from "./[service-name]/index.js"`

## Phase 4: Tests (if present)

- [ ] Test file at `[service-name]/tests/[service-name].module.test.ts`
- [ ] Uses `it.effect` or `it.scoped` from `@effect/vitest`