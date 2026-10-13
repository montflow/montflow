---
id: B001
name: decide-package-architecture
type: planning
originator: user
depends-on: A006
related-tasks:
status: pending
---

# Task B001: Decide the package and plugin architecture

## Type: planning

## Description

Decide the target repository and package architecture for the migrated
toolchain: which packages become server plugins, TUI plugins, shared libraries,
or retained CLIs, and how they are named and exported.

## Requirements

- Decide the package set: which `pi-*` packages map to server plugins, TUI plugins, both, a shared library, or a retained CLI.
- Record that `pi-sessions` is deleted rather than ported, and decide what — if anything — takes its package slot.
- Decide plugin entrypoints and exports (`./`, `./tui`, `./rpc`) and the boundary of each package.
- Decide whether migrated packages keep their `@montflow/*` names and whether Pi-based packages are renamed, deprecated, or removed.
- Decide where the shared Effect domain code (the pure modules) lives relative to the OpenCode adapter.
- Decide whether the workspace remains a standalone app, becomes a TUI plugin, or both.
- Record each decision with its rationale and the A-task evidence it rests on, and list rejected alternatives.

## Completion

- [ ] Architecture decision recorded with package/entrypoint boundaries
- [ ] Package fate table (port / merge / delete) captured
- [ ] Rejected alternatives and rationale recorded
