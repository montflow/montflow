## Phase 1: File Structure

- [ ] Directory `src/structs/<name>/` exists
- [ ] `[name].struct.module.ts` exists with `.struct.module.ts` suffix
- [ ] `index.ts` exists with namespace re-export
- [ ] All imports use `.js` extension

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
- [ ] Directory name is kebab-case
- [ ] Index file re-exports as PascalCase namespace
- [ ] Number brands include `fromNumber`/`toNumber` helpers
- [ ] No `.ts` extension in module exports (use `.js`)
