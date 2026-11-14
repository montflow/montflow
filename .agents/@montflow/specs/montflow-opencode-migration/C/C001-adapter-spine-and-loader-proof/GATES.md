## Stage 0: Loader

- [x] `Host.resolve` returns the `server` entry before the empty key for `@montflow/specs`
- [x] `Host.load` yields `{ id, effect }` for `./server` and `{ id, setup }` for `./tui`
- [x] the `/specs` slash command registers in a running host
- [x] `@montflow/opencode` is the only package importing `@opencode/*`

## Stage 1: Gate

- [x] every package resolves a single `effect` at the host line
- [x] `mf-specs` CLI tests pass
- [x] `pi-specs` remains installed and loadable
- [x] `verify:montflow` reports zero issues
