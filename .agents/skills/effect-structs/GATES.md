# Gates

## Phase 1: Group & File Structure

- [ ] Struct lives in the `structs/` group: `src/structs/[struct-name]/`
- [ ] `[name].structs.module.ts` exists (`structs` group infix per typescript-modules)
- [ ] `index.ts` exists with namespace re-export: `export * as PascalCase from "./[name].structs.module.ts"`
- [ ] `CONTEXT.md` exists at the module root
- [ ] `tests/` folder exists; test files follow [effect-testing](../effect-testing/SKILL.md)
- [ ] Full `.ts` extension in all import/export paths

## Phase 2: Required Exports

- [ ] `Id` const + type pair exported
- [ ] Branded type exported (e.g., `type Name = string & Brand.Brand<Id>` or `Brand.Brand.FromConstructor<typeof make>`)
- [ ] `makeUnsafe` using `Brand.nominal<Name>()` exported
- [ ] String brands: `REGEX` const + `check(str: string)` exported
- [ ] Number brands: `check(num: unknown)` returning `true | string` exported
- [ ] Composed brands (Brand.all): no `check`, uses `Brand.Brand.FromConstructor<typeof make>` for type
- [ ] `make` using `Brand.make<Name>(check)` or `Brand.all(...)` exported
- [ ] `Blueprint` as `Schema.*.pipe(Schema.fromBrand(Id, make))` exported (optional, omit if struct doesn't use it)

## Phase 3: Convention Compliance

- [ ] Id value matches struct name (PascalCase)
- [ ] File name matches directory name (kebab-case)
- [ ] Directory name is kebab-case, singular
- [ ] Index file re-exports as PascalCase namespace
- [ ] Number brands include `fromNumber`/`toNumber` helpers
- [ ] Parent `src/structs/index.ts` re-exports the struct: `export * from "./[struct-name]/index.ts"`
