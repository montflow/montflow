---
id: C001
name: adapter-spine-and-loader-proof
type: execution
originator: user
depends-on: 
related-tasks:
status: complete
---

# Task C001: adapter-spine-and-loader-proof

## Type: execution

## Description

Stand up the OpenCode adapter package and prove the real plugin loader end to end
with the most isolating concern (`pi-specs`), so the host surface is behind seams
before any feature moves onto it (B001 §2/§3, B002 §1/§5).

## Requirements

- Create `@montflow/opencode` implementing `PluginEntry`, `CommandPort`, `InteractionPort`, and `makePorts` against `@opencode/plugin@2.0.18`; it is the sole importer of `@opencode/*`.
- Add the pilot plugin `@montflow/specs` with `.`, `./server`, `./tui` exports and the `mf-specs` bin, ported from `pi-specs`.
- Set the workspace-wide `effect` pin to the host line `4.0.0-rc.112` (root `overrides.effect`, every package `effect` dep, `@effect/vitest`, `@effect/platform-node`).
- Land a real `Host.resolve` + `Host.load` smoke against `@opencode/plugin@2.0.18` asserting `./server` default `{ id, effect }` and `./tui` default `{ id, setup }`.
- Keep `verify:montflow` green; `pi-specs` stays installed because the adapter is additive.

## Completion

- [x] `@montflow/opencode` seams (`PluginEntry`, `CommandPort`, `InteractionPort`, `makePorts`) implemented; sole importer of `@opencode/*`.
- [x] `@montflow/specs` pilot with `.`, `./server`, `./tui` exports and the `mf-specs` bin; `pi-specs` left installed.
- [x] Workspace `effect` pin aligned to `4.0.0-rc.112` (plus `@effect/platform-node-shared`; `effect/unstable/cli` migration).
- [x] Real `Host.resolve` + `Host.load` smoke passes (`./server` `{ id, effect }`, `./tui` `{ id, setup }`).
- [x] `verify:montflow` green.
