## Stage 0: Loader

- [ ] `Host.resolve` returns the `server` entry before the empty key for `@montflow/specs`
- [ ] `Host.load` yields `{ id, effect }` for `./server` and `{ id, setup }` for `./tui`
- [ ] the `/specs` slash command registers in a running host
- [ ] `@montflow/opencode` is the only package importing `@opencode/*`

## Stage 1: Gate

- [ ] every package resolves a single `effect` at the host line
- [ ] `mf-specs` CLI tests pass
- [ ] `pi-specs` remains installed and loadable
- [ ] `verify:montflow` reports zero issues
