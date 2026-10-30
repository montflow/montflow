# Structure module

Tree-level mechanical verification for a whole spec. One
`SpecSnapshot` (a spec directory's files, in memory) is checked as
a whole.

Pure — the caller supplies file paths and contents; this module never
touches disk. Composes the per-file verifiers from `spec`, `task`,
`gates`, `memory`, and `sizing`.

## Belongs here

- `SpecSnapshot`, `SpecFileEntry` — the in-memory directory shape
- `verifySpecTree` — required files, task-directory naming and
  placement, id/name agreement, unique ids, task-table agreement
  (name/type/status/gates), `locked-phases`, dependency existence /
  phase ordering / cycles, one `review` task per phase. Its review input is
  required, so no caller can omit the budget verdict; a caller with no review
  store passes `NO_REVIEW` explicitly
- The record checks a complete task owes: its `## Completion` checklist
  checked (`task.completion-unchecked`) and at least one checked gate item
  (`gate.unchecked`), both warnings, both derived from the parsed task
- Allowing a spec-root `sizing.json` and verifying it there, with the spec's
  real phase ids so a phase override that has no task is a warning
- Deriving each phase's review budget from its non-review task sizes and
  failing a series that holds more rounds attributed to a phase than that
  budget, plus warning for a round with no phase attribution
- Nesting the per-file issues under their path

## Does not belong here

- Per-file parsing and verification — `spec` / `task` / `gates` /
  `memory` own those
- File IO (reading the directory, walking paths) — the consuming
  extension owns that
- Deciding what to do with issues (render, fix, abort) — adapters
