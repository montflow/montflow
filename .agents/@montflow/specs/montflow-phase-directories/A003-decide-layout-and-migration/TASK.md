---
id: A003
name: decide-layout-and-migration
type: planning
originator: user
depends-on: A001, A002
related-tasks: C001
status: complete
---

# Task A003: decide layout and migration

## Type: planning

## Description

Decide the layout grammar and the transformation path in one place, so B001 and
B002 only fill in mechanical detail. The overlapping decision already exists in
`montflow-spec-standard/B002` and `C001`; this spec splits with it rather than
re-deciding it (see `related-tasks: C001`, the `montflow-spec-standard` task).

## Requirements

- Fix the layout grammar: `<spec>/<PHASE>/<PHASE><NNN>-<kebab-name>/`, where
  `<PHASE>` matches `PHASE_PATTERN` (`A`–`ZZ`) and equals the task id's leading
  letters. One phase directory per phase token; no nesting deeper than a task
  directory.
- Decide that the phase directory is a pure container in this spec — task
  directories only. `PHASE.md`, a phase gate, phase memory, and the broadcast
  board/mailbox files are `montflow-spec-standard/C001`'s, not this spec's, and
  C001 extends the allowlist constant when they land.
- Decide the transformation path: one `mf-specs migrate` verb over a flat tree,
  and a layout warning→error transition — a flat task directory at the spec root
  warns with its target path until D001 has migrated the six trees, then errors
  (D003). Reject a layout version field: `SPEC.md` versioning is C001's.
- Decide the fate of the reserved review task and the lock list: one
  `<PHASE>099-review-phase` per phase is kept and moves under its phase
  directory; deleting it and the hand-written `locked-phases` list is C001's
  change, and this spec leaves `locked-phases:` empty.
- Decide the migration scope: the five complete specs plus the in-progress
  `montflow-spec-standard`, the four fixtures, this spec's own tree, the two
  `montflow-create-pi-specs` copies, `AUTHORING_SPEC`, and the docs that name the
  layout.
- Write a normative "ours" / "C001's" table into MEMORY.md; every future task in
  this spec must fit one side of it, and no task may re-plan the other side.
- Change nothing outside this spec.

## Completion

- [x] MEMORY.md states the grammar, the pure-container decision, the migration path, and the 099/lock deferral, one normative sentence each
- [x] The ours/C001 split table names every overlapping artifact exactly once
- [x] The decision names `migrate` as the only transformation path and rejects a layout version field with the reason
- [x] No file outside `.agents/@montflow/specs/montflow-phase-directories/` changed
