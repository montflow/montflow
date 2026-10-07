# Runs service

Workspace adapter over the `@montflow/pi-runs` engine: lists run rows
for the dashboard, dispatches runs through the in-process `Runner`
engine (create + start + live Pi session), loads run detail (run plus
transcript plus receipt), and drives the lifecycle (`steer`, `answer`,
`interrupt`, `resume`). The engine owns the session and the durable
transcript; this service only resolves the runtime and maps results to
dashboard rows.

## Lazy extension loading

Static imports from `@montflow/pi-runs` are type-only (erased at
build). The runtime resolves through `loadPiRuns()` — an Effect over a
cached dynamic `import()`, first called inside `fetchRuns` / `loadRun` /
`startRun`, never at dashboard boot. Same classified `ExtensionLoadError`
(`network` vs `missing` vs `unknown`) contract as the skills service, so
a broken extension toasts instead of crashing the TUI.
`resetExtensionCache` drops the cache in tests.

## Engine runtime

One long-lived `ManagedRuntime<Runner>` per repo root, built lazily on
first dispatch and cached in a module-level map (mirrors
`createRunnerHost` in `@montflow/pi-runs`). Each runtime composes the
root-scoped file-backed `Store`, the real `PiSessionFactory` (or a test
fake via `setSessionFactoryLayer`), and a `WorkspaceBridge` that forwards
`toast` / `notify` to the module-level `RunNotifier` the TUI installs with
`setRunNotifier`. The live-run registry therefore survives across
dispatches — `steer` / `answer` / `interrupt` reach the same session the
`start` created.

The Pi factory dynamically imports `@earendil-works/pi-coding-agent`
from inside `@montflow/pi-runs` (its peer), so the TUI never imports Pi
directly. When that import rejects, `startRun` / `resumeRun` fail with a
reinstall-step message; the caller owns the display (no duplicate toast).

## Belongs here

- `RunSummary` rows plus `slugifyName` (pure, tested), `newRunId`, and
  `isValidRunId`. The summary carries every display field the detail
  sidebar shows — status, model, thinking, tools, spec, progress,
  created, updated — mapped from the engine `Run` by `fromRun`
- `fetchRuns` (load, then `Store.list` through the loaded runtime)
- `loadRun` (run plus events plus receipt for the detail page)
- `startRun` / `steerRun` / `answerRun` / `interruptRun` / `resumeRun`
  engine dispatch (`resumeRun` accepts a completion hook to re-attach)
- `setRunNotifier` / `RunNotifier` (engine bridge target)
- `ensureRunsStore` (directory install) plus `runsDir`
- `parseListOutput` / `runsExtensionInstalled` (pi-session check via
  `pi list`, never fails) plus the `setExtensionProbe` test seam — the
  gate behind agentic profile creation
- test seams: `setSessionFactoryLayer`, `resetRunnerRuntimes`

## Does not belong here

- Dialogs, keyboard handling, signals — those live in `app.tsx` plus
  `components/` (`runs-panel.tsx` renders rows, `run-detail.tsx` renders
  the transcript)
- Filtering — the `skill-filter` module owns query matching
- Schema shapes — those live in `@montflow/pi-runs` (`run/`, `run-event/`, `receipt/`)
- Engine lifecycle rules — `Runner` owns settle/interrupt/replay; this
  service never writes run files
