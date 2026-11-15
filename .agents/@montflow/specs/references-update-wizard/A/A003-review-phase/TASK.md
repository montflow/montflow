---
id: A003
name: review-phase
type: review
originator: user
size: medium
depends-on: A001, A002
write-scope: none
related-tasks:
reviewer-profiles:
status: complete
---

# Task A003: review-phase

## Type: review

## Description

Review phase A: the `update` target-selection engine (A001) and the CLI
flag/wizard wiring (A002). Confirm the `--ref`/`--latest`/`--wizard` surface
validates targets before writing `REFERENCE.md`, leaves the change uncommitted,
preserves `--force` dirty-clone behaviour, and that the wizard is TTY-gated and
shows commit subject/date. Confirm the binary and slash surfaces share the
engine and do not drift.

## Requirements

- The review round covers A001 and A002.
- Every open finding is batched into one fixer attempt and one re-review after `mf-specs review decide`.
- The review confirms the acceptance criteria: an entry can be moved to a commit hash and to latest on its tracked branch using only the wizard or only flags; targets validate before `REFERENCE.md` changes; `--force` behaviour is unchanged; the wizard states when `--force` would be needed.

## Completion

- [x] A review round for phase A is recorded and every finding resolved.
- [x] The phase review decision is recorded in the phase channels.