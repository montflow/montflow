# GATES

## Stage 0: Migration

- [ ] all 14 `REFERENCE.md` entries verify
- [ ] the retired skill directories are gone and no inbound link uses the old names
- [ ] `mf:check:skills` passes after the deletion
- [ ] no `montflow-*` reference skill exists outside the package
- [ ] `status` reports the expected `opencode` state and `sync opencode` is a no-op

## Stage 1: Gate and docs

- [ ] `mf:check:references` passes in a clone-less checkout
- [ ] `mf:check` composes the new scope and the CI matrix has the cell
- [ ] `bun run pack:plugins` emits the package artifact
- [ ] changelog entries exist for the new package and skills
- [ ] `mf-specs check --name montflow-references-plugin` reports zero issues
