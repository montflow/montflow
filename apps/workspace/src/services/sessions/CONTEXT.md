# Sessions service

Workspace adapter over the `@montflow/pi-sessions` engine: lists session
rows for the dashboard, dispatches sessions through the in-process
`SessionRunner` engine (create + start + live Pi session), loads session
detail (session plus transcript plus receipt), and drives the lifecycle
(`steer`, `answer`, `interrupt`, `resume`). The engine owns the session and
the durable transcript; this service only resolves the runtime and maps
results to dashboard rows.

## Lazy extension loading

Static imports from `@montflow/pi-sessions` are type-only (erased at
build). The runtime resolves through `loadPiSessions()` — an Effect over a
cached dynamic `import()`, first called inside `fetchSessions` / `loadSession` /
`startSession`, never at dashboard boot. Same classified `ExtensionLoadError`
(`network` vs `missing` vs `unknown`) contract as the skills service, so
a broken extension toasts instead of crashing the TUI.
`resetExtensionCache` drops the cache in tests.

## Engine runtime

One long-lived `ManagedRuntime<SessionRunner>` per repo root, built lazily on
first dispatch and cached in a module-level map (mirrors
`createSessionRunnerHost` in `@montflow/pi-sessions`). Each runtime composes the
root-scoped file-backed `Store`, the real `PiSessionFactory` (or a test
fake via `setSessionFactoryLayer`), and a `WorkspaceBridge` that forwards
`toast` / `notify` to the module-level `SessionNotifier` the TUI installs with
`setSessionNotifier`. The live-session registry therefore survives across
dispatches — `steer` / `answer` / `interrupt` reach the same session the
`start` created.

The Pi factory dynamically imports `@earendil-works/pi-coding-agent`
from inside `@montflow/pi-sessions` (its peer), so the TUI never imports Pi
directly. When that import rejects, `startSession` / `resumeSession` fail with a
reinstall-step message; the caller owns the display (no duplicate toast).

## Belongs here

- `SessionSummary` rows plus `slugifyName` (pure, tested), `newSessionId`, and
  `isValidSessionId`. The summary carries every display field the detail
  sidebar shows — status, model, thinking, tools, spec, progress,
  created, updated — mapped from the engine `Session` by `fromSession`
- `fetchSessions` (load, then `Store.list` through the loaded runtime)
- `loadSession` (session plus events plus receipt for the detail page)
- `startSession` / `steerSession` / `answerSession` / `interruptSession` / `resumeSession`
  engine dispatch (`resumeSession` accepts a completion hook to re-attach)
- `setSessionNotifier` / `SessionNotifier` (engine bridge target)
- `ensureSessionsStore` (directory install) plus `sessionsDir`
- `parseListOutput` / `sessionsExtensionInstalled` (pi-session check via
  `pi list`, never fails) plus the `setExtensionProbe` test seam — the
  gate behind agentic profile creation
- test seams: `setSessionFactoryLayer`, `resetSessionRuntimes`

## Does not belong here

- Dialogs, keyboard handling, signals — those live in `app.tsx` plus
  `components/` (`sessions-panel.tsx` renders rows, `session-detail.tsx` renders
  the transcript)
- Filtering — the `skill-filter` module owns query matching
- Schema shapes — those live in `@montflow/pi-sessions` (`run/`, `run-event/`, `receipt/`)
- Engine lifecycle rules — `SessionRunner` owns settle/interrupt/replay; this
  service never writes session files
