---
id: C007
name: verification-and-distribution
type: execution
originator: user
depends-on: C006
related-tasks:
status: complete
---

# Task C007: verification-and-distribution

## Type: execution

## Description

Finalize pins, absorb the loader-smoke harness into the gate, add adapter
contract tests, and wire private distribution (B006, A006 §5.7).

## Requirements

- Absorb the loader-smoke harness into `verify:montflow`.
- Add an `effect`, OpenTUI, and `solid` drift check that fails on divergence from the host catalog; the drift check must pin and assert `@effect/platform-node-shared` at the host line (its `^` range silently resolves to `4.0.3`, which imports the removed `effect/cluster/Runners` — see C001 MEMORY).
- Add adapter contract tests (`Vitest.expectTypeOf`, `R = Scope.Scope`).
- Wire private Git-URL/local distribution and the Changesets boundary; the plugins are not published publicly.
- `verify:montflow` green end to end; the CI matrix updated.

## Completion

- [x] Loader smoke absorbed into `verify:montflow` (`turbo smoke`) and the CI matrix.
- [x] `verify:montflow:compat` checks drift for `effect`, `@effect/platform-node*`, `@effect/vitest`, `@opencode/*`, `@opentui/*`, and `solid-js`, including the required `@effect/platform-node-shared@4.0.0-rc.112` override.
- [x] Adapter seam contract tests (`expectTypeOf`, `R = Scope.Scope`) added; they caught three real mirror drifts.
- [x] `verify:montflow:distribution` + `pack:plugins` wire private Git-URL/local distribution; all 6 plugin packages are private and changeset-ignored.
- [x] CI matrix updated; `verify:montflow` green (17/17 turbo tasks, compat 0 drift, distribution 0 problems, all extension verifies 0 issues).
