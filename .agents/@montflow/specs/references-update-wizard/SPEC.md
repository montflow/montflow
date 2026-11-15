---
name: references-update-wizard
status: in-progress
workspace-type: worktree
author: Daniel Montilla
created: 2026-11-15
spec-version: 2
---

# references-update-wizard

## Description

`mf-references update` currently has no way to choose the target. It refreshes
an entry to whatever its committed `REFERENCE.md` `ref:` says. Moving an entry
to a specific commit means hand-editing `REFERENCE.md`, then running `update`.
Moving it to latest on the tracked branch means deleting the `ref:` line, then
running `update`. Both steps are easy to get wrong, and nothing in the CLI
explains the difference.

This spec adds target selection to `update`: a `--ref <commit|tag|branch>` flag
that writes the pin and updates, a `--latest` flag that removes the pin and
follows the tracked branch, and an interactive `--wizard` (or auto-detect when
run in a TTY) that prompts for the choice and shows the commit subject and date
before writing. The `REFERENCE.md` change is left uncommitted for review. As a
consistency improvement, `status`/`verify` and their renderers distinguish
"tracking branch X" from "pinned to <sha>" so tools that need a 40-char commit
id can tell the difference.

## Requirements

- `mf-references update <name> --ref <commit|tag|branch>` writes the resolved
  pin to `REFERENCE.md` (leaving the file uncommitted) and then runs the
  existing `update` refresh for that entry. The `ref` value is validated against
  the remote before `REFERENCE.md` is touched: a commit hash must resolve to a
  full 40-hex id, a tag must resolve to a remote tag commit, and a branch must
  resolve to a remote branch commit. An unresolvable ref is refused with
  `refused:` and nothing is written.
- `mf-references update <name> --latest` removes the `ref:` line from
  `REFERENCE.md` (leaving the file uncommitted) and then runs the existing
  `update` refresh, which follows the tracked default branch the same way it
  does today for an unpinned entry.
- `mf-references update <name> --wizard` (or `update <name>` with no flags when
  run in a terminal) asks which target to use: **specific commit** or **latest
  on the tracked branch**. The wizard resolves a commit hash against the remote
  and shows the commit subject and date before writing anything, then runs
  `update` for the entry. It states when the run would need `--force`.
- `--ref`, `--latest`, and `--wizard` are mutually exclusive on `update`. The
  wizard is never combined with `--all`; passing `--wizard --all` is a usage
  error. `--ref` and `--latest` with `--all` apply the same target to every
  entry.
- The `--force` behaviour for dirty clones stays unchanged: `update` refuses a
  dirty clone unless `--force` is passed, and the wizard states when the run
  would need `--force`.
- Both `--ref` and `--latest` print the `REFERENCE.md` change as a diff and
  leave it uncommitted, so the registry change goes through review.
- `status` and `verify` (and their renderers) report whether an entry is
  **tracking** a branch or **pinned** to a commit. For a `ref:` that is a branch
  name, the line shows `tracking <branch>`; for a commit or tag, it shows
  `pinned to <sha7>` (or the full 40-hex id with `--verbose`). This makes the
  difference visible to tools that expect a pinned commit (for example, a
  consumer's bootstrap that needs a full 40-character id).
- The `montflow-add-reference` skill teaches the new `--ref`/`--latest`/`--wizard`
  update surface and the tracking-vs-pinned distinction in its CLI reference.
  The `CONTEXT.md` and usage text in the CLI reflect the new flags.
- Existing behaviour is unchanged: `update <name>` with no target flags refreshes
  to the committed `ref:` (or tracks the branch when no `ref:` is present), and
  `--all` still iterates every entry in slug order.

## Creation

- rigor: standard
- questions 0/2
- unresolved: none

## Tasks

| ID | Name | Type | Status | Gates |
| --- | --- | --- | --- | --- |
| A001 | engine-update-target | execution | pending | Yes |
| A002 | wire-cli-flags-and-wizard | execution | pending | Yes |
| A003 | review-phase | review | pending | No |
| B001 | status-verify-ref-kind | execution | pending | Yes |
| B002 | align-skill-and-docs | execution | pending | Yes |
| B003 | review-phase | review | pending | No |