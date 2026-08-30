# GATES

## Phase 1: Test Colocation & Naming

- [ ] Every `*.test.ts` file lives in the `tests/` folder of the same module whose code it tests (imports resolve to `../index.ts`)
- [ ] No test files outside a module's own `tests/` folder (no top-level `test/`, no `__tests__/`)
- [ ] Every test file name ends in `.test.ts`

## Phase 2: Index Chain

- [ ] Every folder under `src/` except `src/` itself has an `index.ts`
- [ ] Each folder `index.ts` re-exports all its subfolders via their indexes: `export * from "./[subfolder]/index.ts"`
- [ ] Module `index.ts` remains namespace-style: `export * as ModuleName from "./[module-name].[group].module.ts"`
- [ ] No default exports anywhere in the chain

## Phase 3: Integrity

- [ ] All import/export paths use the full `.ts` extension
- [ ] Typecheck / test suite passes after any moves or additions
