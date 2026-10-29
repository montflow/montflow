---
id: A003
name: map-consumers-and-migration
type: exploratory
originator: user
depends-on:
related-tasks:
status: complete
---

# Task A003: Map consumers and migration impact

## Type: exploratory

## Description

Map every consumer of the reference workflow and every artifact the migration
must touch. The clone root is gitignored, so CI has no clones; the registry is
committed, so it must verify without them. Ten spec files cite a pinned
`opencode` clone, and `tooling/oxlint/anti-slop/` is vendored from a registered
reference. Those facts decide what `verify`, `doctor`, and the migration may
require.

## Requirements

- List every consumer: spec files citing `.agents/references/opencode/`, the vendored `tooling/oxlint/anti-slop/` copy, and any code or test reading a clone.
- Record the pinned-ref facts: which clone the specs pin, where the pin is written, and what `update` must do for a pinned entry versus a default-branch entry.
- Map the 14 registry rows to store entries: slug, URL, purpose text, optional ref, and any row whose name is not already a valid slug.
- Map the migration edits: delete the two workspace skill directories, create the store entries, keep `.gitkeep` and the ignore rule, and update every doc that names the old skills.
- Identify the CI-safe boundary: registry and skill payload are committed; clones are not. Name what `mf:check:references` may assert in a fresh CI checkout and what only `verify --clones` may assert locally.
- Identify the risks: registry/clone drift, a fresh worktree with no clones, renamed skills breaking inbound links, a compiled binary losing its payload, and docs claiming a scope that does not exist.
- No file outside `.agents/@montflow/specs/` is modified.

## Completion

- [ ] Consumer list and pinned-ref facts recorded in MEMORY.md
- [ ] Row-to-entry migration map recorded
- [ ] CI-safe boundary and risk list recorded
