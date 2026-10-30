---
id: D002
name: migrate-task-layout
type: execution
originator: user
depends-on: D001
related-tasks: D001
status: complete
---

# Task D002: migrate-task-layout

## Type: execution

## Description

Upstream now requires every task directory to live under its phase directory:
`.agents/@montflow/specs/<spec>/<Phase>/<TaskID>-<name>/`. This spec still uses
the flat layout it was authored in, so `mf-specs check` fails after the merge.

## Requirements

- Move every task directory of `plugin-host-integration` under its phase letter
  (`A/`, `B/`, `C/`, `D/`), preserving `TASK.md`, `MEMORY.md`, and `GATES.md`.
- Keep the SPEC.md task table consistent with the moved directories.
- `bun run mf:check:specs` passes for this workspace.

## Completion

- [x] Every task directory sits under its phase directory.
- [x] `bun run mf:check:specs` passes.
- [x] No task content lost in the move (git sees renames for tracked tasks; D tasks were still untracked and moved with `mv`).
