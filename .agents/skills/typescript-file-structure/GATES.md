# GATES

## Phase 1: Test Colocation & Naming

- [ ] Every `*.test.ts` file lives in the `tests/` folder of the same module whose code it tests (imports resolve to `../index.js`)
- [ ] No test files outside a module's own `tests/` folder (no top-level `test/`, no `__tests__/`)
- [ ] Every test file name ends in `.test.ts`

## Phase 2: Index Chain

- [ ] `src/index.ts` exists as the package/service entry carve-out and re-exports the package surface
- [ ] Every internal folder under `src/` has an `index.ts`
- [ ] Each group `index.ts` re-exports all its subfolders via their indexes: `export * from "./[subfolder]/index.js"`
- [ ] Module `index.ts` remains namespace-style: `export * as ModuleName from "./[module-name].[group].module.js"`
- [ ] No default exports anywhere in the chain

## Phase 3: Integrity

- [ ] All import/export paths use the `.js` extension
- [ ] No loose file under `src/` other than `src/index.ts`
- [ ] Typecheck / test suite passes after any moves or additions
