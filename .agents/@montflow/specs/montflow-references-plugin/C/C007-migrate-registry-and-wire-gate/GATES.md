# GATES

## Stage 0: Migration

- [x] all 14 `REFERENCE.md` entries verify
- [x] the retired skill directories are gone and no inbound link uses the old names
- [x] `mf:check:skills` passes after the deletion
- [x] no `montflow-*` reference skill exists outside the package
- [x] `status` reports the expected `opencode` state and `sync opencode` is a no-op

## Stage 1: Gate and docs

- [x] `mf:check:references` passes in a clone-less checkout
- [x] `mf:check` composes the new scope and the CI matrix has the cell
- [x] `bun run pack:plugins` emits the package artifact
- [x] changelog entries exist for the new package and skills
- [x] `mf-specs check --name montflow-references-plugin` reports zero issues
