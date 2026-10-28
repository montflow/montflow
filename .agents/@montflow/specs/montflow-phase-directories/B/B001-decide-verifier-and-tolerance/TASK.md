---
id: B001
name: decide-verifier-and-tolerance
type: planning
originator: user
depends-on: A003
related-tasks: C001
status: complete
---

# Task B001: decide verifier and tolerance

## Type: planning

## Description

Fix the exact verifier contract for the phase-directory tree: the per-level
allowlist, the directory-aware snapshot, the finding for each violation, and the
one migration-tolerance finding that keeps the repo gate green until the trees
move. Precise enough that C001 and C002 are transcription, not design.

## Requirements

- State the allowlist as per-level constants: spec root = `SPEC.md` + phase
  directories; phase directory = task directories; task directory =
  `TASK.md`, `MEMORY.md`, `GATES.md`. Name the constant that
  `montflow-spec-standard/C001` extends for `PHASE.md`.
- Fix the snapshot contract: `SpecFileEntry.kind?: 'file' | 'directory'` where
  absent reads as `file`; the directory set is the declared directory entries
  unioned with every parent implied by a file path; a directory entry carries
  empty content. State why the union is required (file-only callers and the
  current test helpers must keep working).
- Give every new finding its exact `field` and `message`: task directory at the
  root, non-phase directory at the root, unexpected file at the root, unexpected
  file in a phase directory, empty phase directory, unexpected directory inside
  a task directory, task id/phase-directory disagreement, and a path deeper than
  a task directory. Keep the existing placement-hint style for mislaid
  `TASK.md`/`MEMORY.md`/`GATES.md`.
- Decide severity: the flat-task-directory-at-root finding is a warning in C002
  (message names the exact target path, `fix` gives the move) and becomes an
  error in D003 when the legacy branch is deleted. Everything else is an error
  from the start. Record that `--strict` promotes the warning meanwhile.
- Decide what the phase source is: phase directories drive the empty-phase and
  `locked-phases` checks and the per-phase review check; `review-link` and
  `lifecycle` stay untouched because they read `phaseOf(task.id)`.
- Decide that `nest` keeps the current spread form so `severity`, `fix`, and
  `line` survive nesting; a port of the prototype's rebuild-with-`issue` is a
  defect.
- Record which existing checks are unchanged (id/name agreement, table
  agreement, duplicate ids, dependency existence/order/cycles, gates and memory
  content) and which tests C002 must add or change.
- Write the contract into MEMORY.md with a finding table. Change nothing outside
  this spec.

## Completion

- [x] MEMORY.md holds a finding table: trigger, field, exact message, severity, owning task
- [x] The allowlist constants and the snapshot union rule are stated normatively
- [x] The warning→error transition names C002 and D003, and `nest` preservation is called out
- [x] The unchanged-check list is explicit, with the review-link/lifecycle no-edit rule
