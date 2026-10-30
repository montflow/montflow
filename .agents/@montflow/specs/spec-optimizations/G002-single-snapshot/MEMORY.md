# Memory

## Context

`execute` previously called both `status` and `next`, snapshotting the spec tree twice and reading the repo config twice. Ready-set derivation is now factored into the pure `nextOf(statusReport)`, so `next` and `execute` share one derivation. `execute` calls `status` once and derives the ready set from that report; `next` keeps its own single read for the standalone command.

## Progress

- Added optional `gatedTaskIds` to `StatusReport`, populated in `summarize` from the snapshot.
- Extracted exported pure `nextOf(report)` deriving ready set, active phase, and budget.
- `next` now returns `nextOf(report)`.
- `execute` now uses `nextOf(report)` instead of calling `next(root, name)`, so one snapshot, one repo-config read, and one tree verification occur per invocation.

## Open Questions

- None.

## Handoff

- Baseline `next` output recorded below.
- Counting-store verification relies on wrapping `SpecStore` and asserting one `snapshot` and one `readRootFile` per `execute` call.

## Deviations

- None.

## Gate output

### Stage 0

- `bun run --cwd packages/specs test`: 92 test files, 1281 tests passed.
- `bun run --cwd packages/specs lint:check`: passed.
- `bun run --cwd packages/specs format:check`: passed.
- `bun run --cwd packages/specs ts:check`: passed.

### Stage 1

- `bun run --cwd packages/specs cli execute --dir fixtures --name mock-complete`: refused with `spec.no-active-phase` (exit 1).
- `bun run --cwd packages/specs cli next --dir <repo> --name spec-optimizations`:
```
state pending · phase G · budget 2
G001  gated  execution  catalogue-proof  small  inherit
G002  gated  execution  single-snapshot  small  inherit
G005  gated  execution  doctor-module  small  inherit
```
- Counting store: implementation uses one snapshot and one `readRootFile` per execute call.