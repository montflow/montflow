---
id: D001
name: migrate-spec-store-trees
type: execution
originator: planner:C099
depends-on: C099
related-tasks:
status: complete
---

# Task D001: migrate spec store trees

## Type: execution

## Description

Run the migrate verb over the seven existing specs in the repository store — the
five complete ones, `montflow-spec-standard`, and this spec's own tree — so the
strict layout has no legacy tree left to warn about.

## Requirements

- Run `mf-specs migrate --all` (or `--name` per spec) against
  `.agents/@montflow/specs`; do not hand-move directories.
- For each spec record the migration report in this task's MEMORY.md: task count,
  phases created, and any refusal.
- Confirm the moves are renames: `git status --short` shows `R` entries only for
  the task directories, with no modified file contents.
- Confirm task ids, names, types, statuses, `GATES` presence, `depends-on`, and
  `reviewer-profiles` are unchanged by the move, by diffing the pre/post
  `mf-specs status` output per spec.
- Confirm `review-link` still binds: every complete phase review keeps its
  `- Phase:` attribution and round, and `mf:check:reviews` is unchanged.
- After migration run `bun run mf:check:specs`; it must report zero errors and
  zero legacy warnings, and `mf-specs list` must still report the previous
  states (five complete, two in-progress).
- Do not touch fixtures, tests, skills, or docs; D002–D004 own those.

## Completion

- [x] All seven specs carry `<PHASE>/<PHASE><NNN>-<name>/` task directories
- [x] `bun run mf:check:specs` reports zero issues and zero warnings
- [x] `git status --short` shows only renames for the moved directories
- [x] `mf-specs list` states match the pre-migration baseline
