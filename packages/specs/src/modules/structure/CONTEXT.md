# Structure module

Tree-level mechanical verification for a whole spec. One
`SpecSnapshot` (a spec directory's files and directories, in memory) is
checked as a whole against the `<PHASE>/<task>/<file>` layout.

Pure — the caller supplies file paths and contents; this module never
touches disk. Composes the per-file verifiers from `spec`, `task`,
`gates`, `memory`, `channel`, and `sizing`.

## Belongs here

- `SpecSnapshot`, `SpecFileEntry` — the in-memory directory shape
- `verifySpecTree` — required files, the phase-directory walk,
  task-directory naming and placement, id/name agreement, unique ids,
  task-table agreement (name/type/status/gates), dependency existence /
  phase ordering / cycles, and an empty phase directory. Its review input is
  required, so no caller can omit the budget verdict; a caller with no review
  store passes `NO_REVIEW` explicitly
- The record checks a complete task owes: its `## Completion` checklist
  checked (`task.completion-unchecked`) and at least one checked gate item
  (`gate.unchecked`), both errors on a `complete` task and both silent on an
  unfinished one, both derived from the parsed task
- Allowing a spec-root `sizing.json` and verifying it there, with the spec's
  real phase ids so a phase override that has no task is a warning
- Deriving each phase's review budget from its non-review task sizes and
  failing a series that holds more rounds attributed to a phase than that
  budget, plus warning for a round with no phase attribution
- Nesting the per-file issues under their path
- Verifying every phase `BOARD.md` and task `MAILBOX.md` once all task ids are
  known, so an addressee is judged against the whole spec (`channel` owns the
  grammar and the `board.*`/`mail.*` codes)
- Locks are derived by `lifecycle`: structure reports task completeness and the
  passed review rounds it receives, never a stored lock list

## Does not belong here

- Per-file parsing and verification — `spec` / `task` / `gates` /
  `memory` own those
- File IO (reading the directory, walking paths) — the consuming
  extension owns that
- Deciding what to do with issues (render, fix, abort) — adapters
