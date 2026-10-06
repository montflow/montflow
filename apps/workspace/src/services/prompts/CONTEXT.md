# Prompts service

Reads workspace prompts for the dashboard: session presence via `pi list`
(the installed check behind the panel's missing message, mirroring the
skills and profiles panels so every panel stages its boot identically)
plus `*.json` rows decoded through the lazily loaded `@montflow/pi-prompts`
runtime into `PromptSummary` rows. The flows live in `@montflow/pi-prompts`:
this service adapts the dashboard to the shared `Interactive` flows
(`createPrompt`, `modifyPrompt`) via generator / modifier ports.

## Lazy extension loading

Static imports from `@montflow/pi-prompts` are type-only (erased at
build). The runtime resolves through `loadPiPrompts()` — a cached
dynamic `import()`, first called inside `fetchPrompts` / `savePrompt`
/ the flow runners, never at dashboard boot.
Consequences:

- A broken or missing extension cannot crash the TUI: the failing load
  toasts `Prompts extension failed to load`, and retry re-imports
  (load failures clear the cache).
- `app.tsx` only knows `Interactive` as structural types plus
  `Prompts.FlowPorts` — the skills, profiles, and prompts `Interactive`
  surfaces are structurally identical, so the shared TUI adapters satisfy
  all three with no conversion. Flow cancellation collapses to `undefined`
  in the runners, so the TUI never touches `CANCELLED`.
- `loadedMatcher()` exposes the shared subsequence matcher to the TUI
  filter picker once a flow has loaded it; the picker only opens
  mid-flow, so pre-load renders fall back to unfiltered rows.

## Belongs here

- `PromptSummary` rows plus `fromPrompt` / `toPrompt` bridges
  between dashboard rows and pi-prompts `Prompt`
- `isExtensionInstalled` (pi-session check via `pi list`, never fails)
  plus `parseListOutput` (pure, tested) — the session probe behind the
  panel's `extension` boot stage
- `isStoreInstalled` (directory check, never fails) plus
  `installPrompts` (directory seed) — the install keybind behind the panel
- `fetchPrompts` (sorted rows through the loaded module, failing with
  displayable message) — the list method behind the panel
- `deletePrompt` (prompt file removal, slug-guarded) plus
  `isValidPromptId` (pure, tested) — the delete keybinds behind the
  list (`x`) and the detail (`d`)
- `savePrompt` (directory create plus `encode` through the loaded
  runtime, slug-guarded) — the create keybind and the manual modify path
- `readRawPrompt` (slug-guarded raw file read) — the dispatch snapshot
  behind the agentic modify run
- Headless agentic **create** reuses the skills service (`buildHeadlessPrompt`,
  `runHeadlessAgent`, `listModelLabels`) over workspace-carried copies of
  the author prompts (`AUTHOR_PREPROMPT`) — the extension module owns the
  canonical, which is not exported through the package index
- `generateFor` / `generateAgentic` ports (name-diff detection, so agent
  chatter never parses). The prompts flows take no loading port of their
  own, so the port wraps the headless run in the TUI working overlay.
- Agentic **modify dispatches a run** through the pi-runs engine
  (`modifyFor`): `Runs.runsExtensionInstalled` gate, raw-file snapshot
  (`readRawPrompt`), `Runs.startRun` with the editor prompt and the
  `read/write/edit` allowlist, the run id recorded, then the shared flow
  unwinds with `CANCELLED`. `modifyCompletion` re-reads the named prompt
  (raw-snapshot no-op check, invalid-JSON split), re-encodes it through
  `savePrompt`, and fires `ModifyFlowHooks`. Same shape as the profiles
  service, so the dashboard's modify flows read the same everywhere.
  `resetDispatchedModifyRun` is the test seam; `modifyCompletion` is
  re-usable as the `onSettled` hook passed to `Runs.resumeRun` after a
  restart
- `runCreateFlow` / `runModifyFlow` workspace hosts (manual or agentic
  behind the TUI overlays); modify resolves `saved` or `dispatched`

## Does not belong here

- Dialogs, keyboard handling, signals — those live in `app.tsx` plus
  `components/` (`dialogs.tsx` backs the `InteractiveUi` ports)
- Filtering — the `skill-filter` module owns query matching (its
  `Filterable` shape covers prompt rows: id, name, description)
