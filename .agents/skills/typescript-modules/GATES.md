# GATES

## Phase 1: Group & File Structure

- [ ] Module lives inside a group folder: `modules/`, `utils/`, `services/`, or `layers/` — never loose
- [ ] Directory `src/[group]/[module-name]/` exists
- [ ] `[module-name].[group].module.ts` exists (or `[module-name].module.ts` when group is `modules`)
- [ ] `index.ts` exists — re-exports module as namespace with full `.ts` extension in the path
- [ ] `CONTEXT.md` exists at the module root
- [ ] `tests/` folder exists; test files named `[module-util-name].test.ts`
- [ ] No `declare namespace` or TypeScript `namespace` keyword used

## Phase 2: Naming Conventions

- [ ] File names are `kebab-case`; export aliases are `PascalCase`
- [ ] Re-export alias matches the PascalCase of the directory name (e.g., `date-range` → `export * as DateRange from`)
- [ ] Group infix appears in the module filename for all groups except `modules`
- [ ] Module name is singular (e.g., `hook`, not `hooks`)
- [ ] Exported functions are defined as arrow-function consts (`export const login = () => {}`), not function declarations
- [ ] No-Echo Rule respected (strong suggestion): function names avoid repeating the module name (`login` not `authLogin`) — any echo is deliberate and justifiable
- [ ] Function names are concise verbs (`make`, `create`, `from`, `to`, `parse`, `validate`) — never `[moduleName][Verb]`

## Phase 3: Export Patterns

- [ ] Primary module file exports all public API — nothing exported outside a module
- [ ] `index.ts` uses `export * as ModuleName` (named namespace re-export only — no default exports, no barrel exports)
- [ ] No `export default` anywhere — only named exports
- [ ] No star re-exports from external libraries

## Phase 4: Code Quality

- [ ] Prefers exported functions over static classes
- [ ] Functions have explicit return types
- [ ] Parameters use branded types or well-defined structs where validated input is expected
- [ ] No side effects at module level
