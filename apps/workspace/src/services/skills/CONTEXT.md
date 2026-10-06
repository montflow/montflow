# Skills service

Reads workspace skills for the dashboard: directory presence (the
installed check behind each panel's missing message) plus `SKILL.md`
frontmatter parsing into `SkillSummary` rows. The frontmatter grammar
still lives here (small, tested, renderer-safe), but the flows live in
`@montflow/pi-skills`: this service adapts the dashboard to the shared
`Interactive` flows (`createSkill`, `modifySkill`, requirements gate)
via `SkillStore` / generator / modifier / installer ports.

## Lazy extension loading

Static imports from `@montflow/pi-skills` are type-only (erased at
build). The runtime resolves through `loadPiSkills()` — an Effect over
a cached dynamic `import()`, first called inside `fetchSkills` /
`runCreateFlow` / `runModifyFlow` / the store ports, never at
dashboard boot. Rejections classify into `ExtensionLoadError`
(`network` vs `missing` vs `unknown`) via `classifyLoadError`, so the
toast tells the user whether to retry, reinstall, or just retry.
Consequences:

- A broken or missing extension cannot crash the TUI: boot, list,
  view, and delete (local parser plus fs) all work without it; the
  failing flow toasts the classified message, and the existing
  dir-install (`⏎`) plus retry recovers (load failures clear the cache,
  so the import re-runs; `resetExtensionCache` drops it in tests).
- Boot is staged through `fetchSkills` (load, then list via the loaded
  `SkillStore` module) behind `SkillsPhase` (`extension` | `skills`),
  which drives the skills-panel `Loader` variant step by step.
- `app.tsx` only knows `Interactive` as types plus `Skills.FlowPorts`.
  Flow cancellation collapses to `undefined` in the runners, so the TUI
  never touches `CANCELLED`.
- `loadedMatcher()` exposes the shared subsequence matcher to the TUI
  filter picker once a flow has loaded it; the picker only opens
  mid-flow, so pre-load renders fall back to unfiltered rows.

## Belongs here

- `SkillSummary` rows plus `decodeSummary` (pure, tested)
- `isExtensionInstalled` (pi-session check via `pi list`, never fails)
  plus `parseListOutput` (pure, tested)
- `getSkills` (directory flag plus sorted rows, never fails) — local
  list fallback; `fetchSkills` (load, then `SkillStore.list` through
  the loaded runtime) is the staged list behind the panel once the
  extension check passes
- `installSkills` via the skills CLI plus `installArgs` (pure, tested)
- `deleteSkill` (store directory removal, id-guarded) plus
  `isValidSkillId` (pure, tested) — the delete keybind behind the detail
- `encodeSummary` plus `saveSkill` (pure/tested, id-guarded) — the
  create keybind and the manual modify path
- `toSkill` / `fromSkill` bridges between dashboard rows and
  pi-skills `Skill` (validated one way, total the other)
- `storeFor` / `installerFor` ports for the shared `Interactive` flows
- `buildHeadlessPrompt` — assembles the child prompt (preprompt, request,
  postprompt) every dispatched run carries; the prompts themselves are the
  extension's canonicals, read through the loaded runtime
- `runHeadlessAgent` (`pi -p`) — still the transport for the profiles and
  prompts services, which build their own child prompts
- Agentic create and modify dispatch a run through the pi-runs engine
  (`generateFor` / `modifyFor`): `Runs.runsExtensionInstalled` gate,
  store snapshot, `Runs.startRun` with the `read/write/edit` allowlist, the
  run id recorded, then the shared flow unwinds with `CANCELLED`.
  `authorCompletion` correlates the fresh skill to the run's final reply
  and `modifyCompletion` re-reads the named skill (raw-snapshot no-op
  check), re-encodes it through `saveSkill`, and fires `CreateFlowHooks` /
  `ModifyFlowHooks`. Same shape as the profiles and prompts services, and
  the same contract the pi extension's run dispatcher uses. Both are
  re-usable as the `onSettled` hook passed to `Runs.resumeRun` after a
  restart; `resetDispatchedRun` / `resetDispatchedModifyRun` are the test
  seams
- `runCreateFlow` / `runModifyFlow` workspace hosts (manual or agentic
  behind the TUI overlays); each resolves `saved` or `dispatched`
- `listModelLabels` plus `parseModelsStore` (pure, tested) — the model
  picker catalogue from `~/.pi/agent/models-store.json`
- `installSkillNames` plus `installArgsFor` (pure, tested) — the
  requirements-gate installer behind agentic flows
- `panelInstalled` checks and `installHint` copy per panel

## Does not belong here

- Dialogs, keyboard handling, signals — those live in `app.tsx` plus
  `components/` (`dialogs.tsx` backs the `InteractiveUi` ports)
- Filtering — the `skill-filter` module owns query matching
- Verification — that lives in `pi-skills`
