# Runs service

Workspace adapter over `@montflow/pi-runs` `Store`: lists run rows for
the dashboard, creates runs (slug id from the name plus initial prompt
and model pin), loads run detail (run plus transcript events plus
receipt), and drives the lifecycle (`ask`, `answer`, `cancel`) plus the
headless agent execution (`runAgent` — `pi -p` over the run prompt,
appending the reply and settling on completion, interruptible so the
detail page can stop it mid-run).

## Lazy extension loading

Static imports from `@montflow/pi-runs` are type-only (erased at
build). The runtime resolves through `loadPiRuns()` — an Effect over a
cached dynamic `import()`, first called inside `fetchRuns` /
`createRun` / `loadRun`, never at dashboard boot. Same classified
`ExtensionLoadError` (`network` vs `missing` vs `unknown`) contract as
the skills service, so a broken extension toasts instead of crashing
the TUI. `resetExtensionCache` drops the cache in tests.

## Belongs here

- `RunSummary` rows plus `slugifyName` (pure, tested) and `isValidRunId`
- `fetchRuns` (load, then `Store.list` through the loaded runtime)
- `createRun` (slug, `Store.create` + `start` + initial user `append`)
- `loadRun` (run plus events plus receipt for the detail page)
- `cancelRun` / `askRun` / `answerRun` lifecycle passthroughs
- `runAgent` headless execution over `pi -p` (interruptible, settles on exit)
- `ensureRunsStore` (directory install) plus `runsDir`

## Does not belong here

- Dialogs, keyboard handling, signals — those live in `app.tsx` plus
  `components/` (`runs-panel.tsx` renders rows, `run-detail.tsx` renders
  the transcript)
- Filtering — the `skill-filter` module owns query matching
- Schema shapes — those live in `@montflow/pi-runs` (`run/`, `run-event/`, `receipt/`)
