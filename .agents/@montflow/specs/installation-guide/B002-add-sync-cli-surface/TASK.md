---
id: B002
name: add-sync-cli-surface
type: execution
originator: user
depends-on: B001
related-tasks: B003
status: complete
---

# Task B002: add-sync-cli-surface

## Type: execution

## Description

Wire the sync engine into both `mf-skills` front ends: the `effect/cli` binary
and the hand-rolled `/mf-skills` slash parser. Rendering lives in the renderers
module so both surfaces print the same report.

## Requirements

- `mf-skills sync` accepts `--from <path>`, `--dir <path>`, `--check`, and
  `--verbose`; flags work as `--flag value` and `--flag=value`.
- `--check` exits 1 when anything would change, 0 when the target is current;
  a clean run exits 0.
- `--verbose` adds per-file detail; the default report is one line per skill.
- `/mf-skills sync` parses the same flags, delegates to the same engine, and
  updates `USAGE`, `COMMAND_DESCRIPTION`, and the known-flag sets so an unknown
  flag is usage, not a silent no-op.
- The slash and binary reports are identical for the same store state.
- Unknown flags exit non-zero through the existing `exitFailed` idiom.

## Completion

- [ ] Both front ends expose `sync` with identical flags and output.
- [ ] `--check` and exit codes match the contract in this task.
- [ ] Help text on both surfaces lists `sync`.
