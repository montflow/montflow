---
id: C005
name: port-tui-and-workspace
type: execution
originator: user
depends-on: C001, C002
related-tasks:
status: complete
---

# Task C005: port-tui-and-workspace

## Type: execution

## Description

Port the interactive widgets and the workspace into the OpenCode TUI as one
plugin route page, and retire the standalone app (B004 §1/§2/§6/§7).

## Requirements

- Add `@montflow/workspace` `./server` + `./tui` entries; the configurable grid becomes one fullscreen TUI plugin route page via `GridPagePort`.
- Implement the adapter `./tui` widgets from `pi-interactive`; wire `CustomViewPort`, `DataPort`, `InteractionPort`, `ModelPort`, `StoragePort`.
- Reuse the native session list/detail/dispatch; delete the montflow session panels and the receipt overlay.
- Raise `@opentui/core|solid` to `>=0.5.12` as peers (devDeps pinned to the host catalog) and `solid-js` to `1.9.15`.
- Remove the standalone app scripts, the `createCliRenderer` bootstrap, and the `MissingPi`/`pi` probe; run the `0.5.11` to `0.5.12` spike first.
- `verify:montflow` green.

## Completion

- [x] `@montflow/workspace` ships `.`, `./server`, `./tui`; the configurable grid renders as the fullscreen `workspace` route page via `GridPagePort`.
- [x] Adapter TUI widgets implemented; `CustomViewPort`, `DataPort`, `InteractionPort`, `ModelPort`, `StoragePort` wired through `makeTuiPorts`.
- [x] Native session list/detail/dispatch reused; montflow session panels and the receipt overlay deleted.
- [x] 0.5.12 spike passed; `@opentui/core|solid` at `>=0.5.12` peers (0.5.12 devDeps), `solid-js` 1.9.15.
- [x] Standalone app scripts, `createCliRenderer` bootstrap, and the `MissingPi`/`pi` probe removed.
- [x] Loader smoke covers `@montflow/workspace`; `verify:montflow` green (17/17 turbo tasks, all extension verifies 0 issues).
