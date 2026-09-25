# Memory

## Context

Task D001: map workspace integration for the run engine.

## Progress

- 2026-09-23: complete.

## Integration shape

**Dependency API, in-process.** `apps/workspace` imports `@montflow/pi-runs`
(workspace dependency) and builds the engine's `Runner` layer with
`PiSessionFactory` + a TUI `WorkspaceBridge` (toasts/notify → `pushToast`).
Do **not** spawn the Pi extension or a `pi -p` child. One long-lived
`ManagedRuntime` per repo root, built once (mirrors `apps/runtime` in pi-runs).

## Touch points

| File | Symbol / line | Change |
| --- | --- | --- |
| `services/runs/runs.services.module.ts` | `runAgent` (~line 400) | replace `pi -p` spawn with engine dispatch |
| same | `cancelRun` / `askRun` / `answerRun` | route through `Runner` (keep Store readers) |
| `app.tsx` | `launchAgentMutation` (:1428), `createRunMutation` (:1469) | dispatch via engine |
| `app.tsx` | `answerRunMutation` (:1380) | `Runner.answer`, no relaunch |
| `app.tsx` | `interruptRun` (:1334), esc path (:2528-2553) | `Runner.interrupt` |
| `app.tsx` | `pendingAgentRunId`, `flowFiber` (:441,:486) | drop child-fiber tracking |
| `app.tsx` | run-detail keys (:2589-2617), render (:3150-3190) | add steer/answer + live refresh |
| `components/run-detail.tsx` | whole file | live state, input affordance |
| `components/keybinds.ts` | `Keybinds` | `s steer`, `a answer` entries |
| `services/query/query.services.module.ts` | `fetchRunsList` | unchanged (read path) |

## Run-detail gaps

- No steering input; no answer input (answer exists but relaunches `pi -p`).
- Transcript loads once (`loadRunDetail`); no live refresh while running.
- Interrupt kills the `pi -p` child; no engine `interrupt`.

## Must not regress

- Skills/prompts agentic flows (`Skills.runCreateFlow` etc.) stay on `pi -p`.
- Manual profile creation, runs list/search/install, detail view/scroll.

## Open Questions

- Live refresh: poll `Runner.detail` while open, or subscribe to engine events.

## Handoff

- D002 replaces the runner; D003 adds steer/answer/live-refresh UI.

## Deviations

- None.
