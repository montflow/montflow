---
id: C002
name: implement-phase-layout-verifier
type: execution
originator: planner:B099
depends-on: C001
related-tasks: C001
status: complete
---

# Task C002: implement phase layout verifier

## Type: execution

## Description

Turn the snapshot knowledge from C001 into the strict phase-directory verifier:
spec root holds `SPEC.md` plus phase directories, a phase directory holds task
directories, a task directory holds its three files. A flat task directory at the
root warns with its target path until D001 has migrated the six repository trees;
every other violation errors immediately. The four fixtures move in this task so
the package suite stays exact — the warning exists only for the repository's own
not-yet-migrated trees, never for a fixture assertion.

## Requirements

- Rework the directory walk in `verifySpecTree` to two levels: collect root
  children, classify each as `SPEC.md`, a phase directory (`PHASE_PATTERN`), or a
  finding; then walk each phase directory's task directories in `phaseRank`
  order.
- Add the per-level allowlist: no file at a phase-directory level (with the
  existing placement hints for `TASK.md` / `MEMORY.md` / `GATES.md`), no
  directory inside a task directory, no nested path deeper than
  `<phase>/<task>/<file>`, and an empty phase directory is an error.
- Emit the legacy finding as a **warning** when a task directory sits at the spec
  root: message names `"<PHASE>/<dir>/"` and `fix` gives the target path. Keep it
  a one-branch change so D003 can delete the branch and emit an error instead.
- Fail a task directory whose `parseTaskDirName(dir).phase` differs from its
  containing phase directory, and pass the leaf directory name to
  `verifyTaskFile`.
- Key `locked-phases` and the one-`review`-per-phase check to the phase
  directories, and keep every existing check (id/name agreement, table
  agreement, duplicate ids, dependency existence/order/cycles, gates and memory
  content) unchanged.
- Keep `nest`'s spread form so `severity`, `fix`, and `line` survive; do not port
  the prototype's rebuild-with-`issue`.
- Move the four fixtures under `packages/specs/fixtures` into phase directories
  by hand (the `migrate` verb arrives in C003), preserving every file byte, and
  update `src/apps/cli/tests/fixtures.test.ts` to the nested fields. Leave
  `fixtures/README.md` to D002.
- Update `renderSpecScaffold` to write every task file at
  `${phase}/${<id>-<name>}/…` while `SPEC.md` stays at the root, so newly
  generated trees verify clean under the new walk.
- Update `gatedTaskIds` in `apps/cli/cli.apps.module.ts` to read the task
  directory from the leaf of `<phase>/<task>/GATES.md`, so `next` still marks a
  nested gated task. `summarize`, `renderStatus`, and `renderNext` are
  depth-agnostic and stay unchanged.
- Add the coverage from B001's finding table as structure tests, including: flat
  legacy task directory warns, empty phase directory errors, stray file in a
  phase directory, stray directory in a task directory, phase-letter mismatch,
  nested path, valid spec listed with and without directory entries.

## Completion

- [x] `bun run --cwd packages/specs test` passes
- [x] `bun run --cwd packages/specs fixtures:check` is clean for `mock-ok` and `mock-complete` and fails only for the fixtures that were already documented as failing
- [x] `bun run mf:check:specs` reports warnings only for the six unmigrated trees, zero errors
- [x] fresh scaffold output verifies clean and `next` marks a nested gated task `gated`
- [x] No change to `modules/task`, `modules/review-link`, `modules/lifecycle`, or the reviews package
