---
id: C008
name: align-cli-and-tui-surfaces
type: execution
originator: planner:B005
size: medium
depends-on: C001, C005
related-tasks: C002, C003
status: pending
---

# Task C008: align CLI and TUI surfaces

## Type: execution

## Description

B001 makes the CLI and TUI phase-aware for the rail. This task finishes the job for
the v2 contract: every `mf-specs` command and the TUI specs picker read
`PHASE.md`, the derived lock, and the new verbs, and no surface falls back to the
flat task-id prefix or a stored lock list.

## Requirements

- `check`, `status`, `state`, `next`, `list`, `create`, `author`, `execute`, `sizing`, `resolve`, `models`, `which`, and `doctor` read the v2 tree. `status` and `state` show the derived phase lock and `PHASE.md` review decision, never `locked-phases`.
- `create` and `init` emit phase directories; `next` derives the active phase from the tree; `list` reports the derived lifecycle without reading a lock list.
- The OpenCode host tools and `/specs` slash forms keep parity with the binary: the same spec, phase, and derived state for the same invocation.
- The TUI specs picker lists only directories that contain `SPEC.md`, never a phase or task directory, and forwards `author`, `execute`, and `sizing-config` unchanged.
- Tests cover a v2 store with phase directories on the CLI and TUI paths, including a phase dir that must not appear as a spec.
- `bun run mf-specs:check` reports zero issues for every spec in the store.

## Completion

- [ ] Every command above is exercised against this spec and reports the same phase and lock state as `check`
- [ ] The TUI test proves phase and task directories are never offered as specs
- [ ] The host slash and tool forms match the binary on one spec, phase, and failure case
- [ ] `ts:check`, `lint:check`, `fmt:check`, and `mf-specs:check` pass
