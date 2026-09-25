# Memory

## Context

Task C002: `mf-runs` CLI surface over the run engine.

## Progress

- 2026-09-23: complete.

## Done

- `apps/runtime`: `runnerLayer({ root, bridge })`, `storeLayer(root)` (runs dir
  = `<root>/.agents/@montflow/pi-runs/runs`), `ConsoleBridge`.
- `apps/commands`: `parseCommand` + `execute` (list/status/verify/start/steer/answer).
- `apps/cli`: `runCli` + `main.ts` bun bin; `package.json` `bin.mf-runs`.
- Smoke: `mf-runs help|list|status|verify` work against the real store.

## Known limitation

- `steer`/`answer` require a live run in the same process; a fresh CLI
  invocation reports the engine's "not live" error. Interactive steering is the
  extension's job (single long-lived Pi session).

## Gates

- `format:check`, `lint:check`, `ts:check`, `test` all pass (109 tests).

## Open Questions

- None.

## Handoff

- C003 tests parse/execute; D001/D002 reuse `Runner`.

## Deviations

- CLI verb set matches A004; interactive steer/answer documented as extension-only.
