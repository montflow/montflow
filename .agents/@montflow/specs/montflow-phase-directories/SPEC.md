---
name: montflow-phase-directories
status: in-progress
workspace-type: in-place
author: Daniel Montilla
created: 2026-10-28
locked-phases: A, B, C, D, E
---

# montflow phase directories

## Description

A spec today is a flat list of `<PHASE><NNN>-<kebab-name>/` task directories at
the spec root. The phase exists only as the leading letters of a task id, so the
tree cannot show which tasks belong together, and the verifier cannot reject an
empty directory or a stray one because the snapshot it receives contains files
only. Move every task under a real phase directory —
`<spec>/<PHASE>/<PHASE><NNN>-<kebab-name>/` — make the phase directory a pure
container, and enforce a strict allowlist at every level: the spec root holds
`SPEC.md` plus phase directories, a phase directory holds task directories, and
a task directory holds `TASK.md`, `MEMORY.md`, and `GATES.md`. Give the snapshot
directory entries so an empty phase directory, a stray directory, or a stray
file fails mechanically. Teach `mf-specs create` to emit the layout, add a
`migrate` verb, and migrate the six existing specs (five complete plus the
in-progress `montflow-spec-standard`), the fixtures, the skills, and the docs.

**Scope split with `montflow-spec-standard`.** This work overlaps
`montflow-spec-standard/C001` and is split deliberately: this spec owns the
layout grammar, the per-level allowlist, directory-aware snapshots, the
scaffold, the `migrate` verb, the tree-level checks that live in the layout, the
fixtures, and the migration of the six existing specs.
`montflow-spec-standard/C001` keeps the `SPEC.md` version field, `PHASE.md`,
derived locks, review recorded as a phase field, and the deletion of the
reserved `<PHASE>099-review-phase` task and the hand-written `locked-phases`
list. Where this spec's layout would need a phase-level file or a version
marker, it stops and leaves the field to C001; C001 extends this spec's
allowlist constant when `PHASE.md` lands. The overlap is recorded in
`related-tasks` as `C001` (the `montflow-spec-standard` task). Neither spec
re-plans the other's scope.

The unmerged prototype commit `f17365f` proves the shape but is not portable
as-is: it was built on the retired `packages/pi-specs` tree and also carried
`review:` / `review-cycles:` task fields and a `ReviewProbe` service that the
current `reviewer-profiles` field and `modules/review-link` supersede. This spec
ports the layout, the allowlist, and the directory snapshot only.

## Requirements

- Every task directory is `<spec>/<PHASE>/<PHASE><NNN>-<kebab-name>/`, where
  `<PHASE>` matches `PHASE_PATTERN` and equals the task id's leading letters;
  one- and two-letter phases (`A`, `AA`) both work.
- A phase directory is a pure container in this spec: task directories only, no
  `PHASE.md`, gate, memory, board, or mailbox file. Adding those is
  `montflow-spec-standard/C001`'s change and it extends the allowlist then.
- The verifier enforces a strict per-level allowlist — spec root = `SPEC.md` +
  phase directories, phase directory = task directories, task directory =
  `TASK.md` / `MEMORY.md` / `GATES.md` — and the snapshot carries directory
  entries so an empty phase directory, a stray directory, or a stray file is a
  failure with an actionable field and message.
- A task directory whose id letters disagree with its containing phase
  directory fails; a task directory living at the spec root fails; a path
  nested deeper than a task directory fails.
- `SpecFileEntry` carries an optional `kind` (`file` | `directory`) that reads
  as `file` when absent, and the directory set is the declared directory entries
  unioned with the parents implied by file paths, so a file-only snapshot still
  verifies.
- `locked-phases` still must name a real phase; the per-phase review check is
  keyed to the tasks inside a phase directory. `review-link` and `lifecycle`
  keep reading phases from task ids and are not edited.
- `mf-specs create` writes the nested layout and reports POSIX-relative paths;
  `mf-specs next --name <spec>` still marks a task `gated` when its
  `GATES.md` exists at the nested path.
- `mf-specs migrate --name <spec>` (and `--all`) rewrites a flat spec into the
  phase layout with byte-identical file contents, refuses a mixed tree, is a
  no-op on an already-migrated spec, and prints the moves it makes.
- Migration tolerance is explicit: until the six trees are migrated, a flat task
  directory at the spec root is a warning naming its target path; once they are,
  the same tree is an error. This is the transformation path — there is no
  layout version field, because `montflow-spec-standard/C001` owns `SPEC.md`
  versioning.
- The five complete specs and `montflow-spec-standard` migrate, and `mf-specs
  check` reports zero errors over the store. Task ids, names, types, statuses,
  gates, review rounds, and review-series attribution are unchanged by the
  move.
- The four fixtures migrate to the new layout, a stray-directory fixture is
  added, the temporary legacy-flat fixture is removed when the warning becomes
  an error, and the fixture expectations stay exact.
- `montflow-create-pi-specs` bumps to `3.0.0` in the workspace copy and the
  packaged copy, both byte-identical, with a CHANGELOG entry; `AUTHORING_SPEC`
  text, the package README, the fixtures README, and the affected `CONTEXT.md`
  files describe the phase-directory layout.
- The reserved `<PHASE>099-review-phase` task keeps one instance per phase and
  moves under its phase directory; its removal and the removal of
  `locked-phases` belong to `montflow-spec-standard/C001` and are not done here.
- The prototype's `review:`, `review-cycles:`, and `ReviewProbe` are not ported;
  the review contract stays `reviewer-profiles` plus `modules/review-link`.
- Review-series binding is enforced on the workspace path: `apps/workspace`
  loads the series and passes them to `verifySpecTree(snapshot, review)`.
  `mf-specs check` passes no series, because `@montflow/reviews` already depends
  on `@montflow/specs` and the reverse edge would be a cycle. This spec states
  that boundary and does not add a reverse dependency.
- Phase F reconciles the branch with `origin/main` and audits the rest of the
  workspace for a remaining flat-layout assumption before the change is proposed
  for merge. It is authored now and executed after the PR opens.
- A001–A003 and B001–B002 modify no file outside
  `.agents/@montflow/specs/`; C001–C003, D001–D004, and E001–E004 change
  `packages/specs`, `apps/workspace/src/services/specs`, the spec store
  (`.agents/@montflow/specs`) for the D001 migration, the two
  `montflow-create-pi-specs` and `montflow-find-pi-specs` copies, and the docs
  named above, and nothing else.

## Tasks

| ID   | Name                                | Type        | Status  | Gates |
| ---- | ----------------------------------- | ----------- | ------- | ----- |
| A001 | inventory-current-verifier          | exploratory | complete | No    |
| A002 | inventory-prototype-deltas          | exploratory | complete | No    |
| A003 | decide-layout-and-migration         | planning    | complete | No    |
| A099 | review-phase                        | review      | complete | No   |
| B001 | decide-verifier-and-tolerance       | planning    | complete | No    |
| B002 | decide-scaffold-cli-and-migration   | planning    | complete | No    |
| B099 | review-phase                        | review      | complete | No    |
| C001 | implement-directory-snapshot        | execution   | complete | Yes   |
| C002 | implement-phase-layout-verifier     | execution   | complete | Yes   |
| C003 | implement-migrate-command           | execution   | complete | Yes   |
| C099 | review-phase                        | review      | complete | No    |
| D001 | migrate-spec-store-trees            | execution   | complete | Yes   |
| D002 | align-fixtures-and-tests            | execution   | complete | Yes   |
| D003 | harden-layout-check                 | execution   | complete | Yes   |
| D004 | align-skills-docs-and-payloads      | execution   | complete | Yes   |
| D099 | review-phase                        | review      | complete | No    |
| E001 | fix-migrate-robustness              | defect      | complete | Yes   |
| E002 | fix-verifier-and-scaffold-edges     | defect      | complete | Yes   |
| E003 | align-review-evidence-and-docs      | defect      | complete | Yes   |
| E004 | document-review-link-scope          | defect      | complete | Yes   |
| E099 | review-phase                        | review      | complete | No    |
| F001 | reconcile-with-main                 | execution   | pending | Yes   |
| F002 | audit-cross-store-gaps              | exploratory | pending | No    |
| F099 | review-phase                        | review      | pending | No    |
