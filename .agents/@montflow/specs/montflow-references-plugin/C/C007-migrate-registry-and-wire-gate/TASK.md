---
id: C007
name: migrate-registry-and-wire-gate
type: execution
originator: user
depends-on: C006, B001
related-tasks:
status: complete
---

# Task C007: Migrate the registry and wire the gate

## Type: execution

## Description

Move the 14 registry rows into the committed store, retire the two generic
workspace skills, wire `mf:check:references` into the repo gate and CI, and
update every doc that names the reference surface. After this task the old
table is gone and the package is the only way to add, update, sync, status, or
verify a reference.

## Requirements

- Create one `.agents/@montflow/references/<slug>/REFERENCE.md` per row from the B001 migration table, including the `opencode` pin the specs cite; keep `.agents/references/.gitkeep` and the ignore rule.
- Delete both skill directories wholesale (`.agents/skills/adding-references/` and `.agents/skills/finding-references/`, including `finding-references/GATES.md`), run `mf:check:skills` after deletion, confirm no `montflow-*` reference skill is left outside the package, and update every inbound link and the `authoring-skills` groups table.
- Add `mf:check:references` to root `package.json` and to `mf:check`; add the CI matrix cell in `.github/workflows/verify.yml`.
- Add changelog entries for the new package and its two skills; state the migration in the package README.
- Leave the workspace docs and cross-skill alignment to phase D.
- Confirm `bun run pack:plugins` emits the package artifact and `bun run mf:check:references` passes in a clone-less state.
- Confirm the pinned `opencode` entry verifies, `status` reports the expected local state, and `sync opencode` is a no-op on a present clone.
- No file outside the package, the store, the retired skill directories, the named docs, `package.json`, `bun.lock`, CI config, and `.agents/@montflow/specs/` is modified.

## Completion

- [ ] 14 entries migrated and the old table deleted
- [ ] Old skills retired; no generic reference skill remains; every inbound link updated
- [ ] `mf:check:references`, CI, and pack wired; all gates pass
