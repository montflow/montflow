# GATES

## Phase 1: Location & Files

- [ ] Author separation respected: the test author is not the implementer of the utility — otherwise the user explicitly confirmed proceeding

- [ ] Test files live in `src/[group]/[module-name]/tests/` of the same module they test — never elsewhere
- [ ] File named `[utility-name].test.ts` (kebab-case), one file per utility under test

## Phase 2: Tooling

- [ ] `@effect/vitest` and `vitest` present in package `devDependencies` (installed if missing)
- [ ] When the package depends on `effect`, `@effect/vitest` version matches it exactly (no caret)
- [ ] Package `test` script includes type testing: `vitest run --typecheck`
- [ ] `vitest.config.ts` has `typecheck.enabled: true` and `typecheck.include` covering the module test files

## Phase 3: Imports

- [ ] Test library imported as a namespace: `import * as Vitest from "@effect/vitest"` — never bare `vitest`, `node:test`, or other libraries
- [ ] Module under test imported through its public API: `import * as ModuleName from "../index.ts"`
- [ ] No deep imports into internal files, no default/named imports of the module

## Phase 4: Suites

- [ ] At most two suites per file, ordered: `types` (optional) then `runtime`
- [ ] Suite names fully qualified: `"ModuleName.utilityName runtime"` / `"ModuleName.utilityName types"` (PascalCase module alias, dot, utility name, space, kind)
- [ ] No bare suite names like `describe("parse")`
- [ ] Type assertions in `types` suites use `Vitest.expectTypeOf(...)` or `// @ts-expect-error` with a reason

## Phase 5: Quality

- [ ] Tests assert real behavior, not mock interactions
- [ ] Tests are independent, repeatable, and self-validating
- [ ] Error paths and boundary values covered where relevant

## Phase 6: Effect Patterns (Effect code only)

- [ ] Effectful tests use `Vitest.it.effect`, `Vitest.it.live`, or `Vitest.it.scoped` (not raw promises)
- [ ] Test services supplied via `Layer.effectContext` or `Layer.succeed`
- [ ] Time-sensitive tests use `TestClock` instead of arbitrary `Effect.sleep`
- [ ] Fiber synchronization uses `Queue`, `Deferred`, `Ref`, or `Latch` rather than sleeps
