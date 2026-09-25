# Memory

## Context

Task C001: Pi extension surface over the run engine.

## Progress

- 2026-09-23: complete.

## Done

- `packages/pi-runs/src/extension.ts`: default export registers `/mf-runs` and
  agent tools `run_start`/`run_status`/`run_verify`/`run_list`/`run_steer`/`run_answer`.
- Runner layer built once via `ManagedRuntime`, so live runs persist across
  commands/tools (steer/answer reach same-session runs).
- `WorkspaceBridge` backed by the current Pi `ctx.ui` (toast/notify).
- `package.json`: `pi.extensions: ["./src/extension.ts"]`, `./extension` export.
- `.pi/settings.json`: added `../packages/pi-runs`.
- Verified: `pi list` shows pi-runs; `pi -p "/mf-runs help"` exits 0 with no
  extension load error; registration unit test asserts command + tool names.

## Gates

- `format:check`, `lint:check`, `ts:check`, `test` all pass (109 tests).

## Open Questions

- None.

## Handoff

- D001 probes `pi list` for `pi-runs` to gate agentic flows.

## Deviations

- None.
