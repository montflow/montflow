## Phase 1: File Structure

- [ ] Directory `src/[category]/[module-name]/` exists
- [ ] `[module-name].module.ts` exists
- [ ] `index.ts` exists — re-exports module as namespace
- [ ] No `.ts` extension in import/export paths (must use `.js`)
- [ ] No `declare namespace` or TypeScript `namespace` keyword used

## Phase 2: Naming Conventions

- [ ] Module name is singular (e.g., `hook`, not `hooks`)
- [ ] Exported function names avoid repeating the module name (e.g., `make` not `makeHook`, `create` not `createHook`)
- [ ] Function names are concise verbs (`make`, `create`, `from`, `to`, `parse`, `validate`) — never `[moduleName][Verb]`
- [ ] Re-export alias name matches the PascalCase of the directory name (e.g., `hook` -> `export * as Hook from`)

## Phase 3: Export Patterns

- [ ] Primary module file exports all public API
- [ ] `index.ts` uses `export * as ModuleName` (named namespace re-export only — no default exports, no barrel exports)
- [ ] No `export default` anywhere — only named exports
- [ ] No star re-exports from external libraries

## Phase 4: Code Quality

- [ ] Prefers exported functions over static classes
- [ ] Functions have explicit return types
- [ ] Parameters use branded types or well-defined structs where validated input is expected
- [ ] No side effects at module level