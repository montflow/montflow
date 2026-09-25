# Memory

## Context

Task D002: replace the workspace's headless `pi -p` runner with the in-process
pi-runs engine.

## Progress

- 2026-09-23: complete (dispatched as `workspace-runner` subrun).

## Done

- `apps/workspace/src/services/runs/runs.services.module.ts`: removed `runAgent`
  (`pi -p` spawn), `AgentError`, and the timeout. Added a lazily-built,
  per-repo-root `ManagedRuntime<Runner>` (`storeLayer` + `PiSessionFactory` +
  `WorkspaceBridge`) mirroring pi-runs `createRunnerHost`, with a module-level
  `setRunNotifier`/`RunNotifier` so the TUI receives toasts/notifications.
- Engine verbs: `startRun`, `steerRun`, `answerRun`, `interruptRun`, `resumeRun`
  via `withRunner`; read paths (`fetchRuns`, `loadRun`, `runsInstalled`,
  `ensureRunsStore`) unchanged.
- A `sessionFactoryLayer` seam lets tests inject a fake Pi session.
- `app.tsx`: `createRunMutation`/`launchAgentMutation` dispatch `startRun`;
  `answerRunMutation` calls `answerRun` (no relaunch); `interruptRun` + esc call
  the engine; `pi -p` child/fiber tracking removed.
- `services/runs/CONTEXT.md` rewritten.
- Tests: `lifecycle.test.ts` (start/steer/answer/interrupt/resume/settle/notify/
  missing-Pi).

## Gates

- workspace format/lint/ts clean; `test` 268 passed; pi-runs 133 passed.
- Runs path spawns no child process.

## Open Questions

- None.

## Handoff

- D003 consumes the engine verbs for the detail UI.

## Deviations

- Live transcript refresh is a 1s poll (D003), not an engine event stream.
