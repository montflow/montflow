---
id: A001
name: explore-pi-extension-surface
type: exploratory
originator: user
depends-on:
related-tasks:
status: complete
---

# Task A001: Inventory the Pi surface each package consumes

## Type: exploratory

## Description

Inventory what every `pi-*` package consumes from Pi and where the code already
abstracts Pi away. The result is the source side of the migration matrix: Pi
primitive → concern → the local seam (if any) that already isolates it.

## Requirements

- For every package under `packages/pi-*`, record the `pi`, `bin`, and `exports` fields and every import from `@earendil-works/*`.
- Classify each Pi primitive used (`registerCommand`, `registerTool`, `on('session_shutdown')`, `ui.select`/`confirm`/`input`/`notify`/`custom`, `ModelRuntime.*`, `SessionManager.*`, `resolveCliModel`, `createAgentSession`, `defineTool`, `pi-tui` components) by the concern it serves.
- Identify every existing seam that already isolates Pi (`packages/pi-effect`, `SessionPort`/`SessionFactory` in `pi-sessions`, the injected `Interactive` ports) and the exact interface each exposes.
- Record which packages are pure-Effect with no Pi runtime dependency (`pi-workflows`, `pi-specs`), which are CLI-only, and which own a session loop.
- Record the `mf-*` CLI binaries, their command surface, and whether they touch Pi at runtime.
- No file outside `.agents/@montflow/specs/` is modified.

## Completion

- [ ] Per-package capability matrix captured in MEMORY.md
- [ ] Adapter-seam inventory (interface plus implementing file) captured
