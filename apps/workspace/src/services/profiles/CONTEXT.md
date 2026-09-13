# Profiles service

Reads workspace profiles for the dashboard: session presence via `pi list`
(the installed check behind the panel's missing message, mirroring the
skills panel so both panels stage their boot identically) plus `PROFILE.md`
rows decoded through the lazily loaded `@montflow/pi-profiles` runtime
into `ProfileSummary` rows. The flows live in `@montflow/pi-profiles`:
this service adapts the dashboard to the shared `Interactive` flows
(`createProfile`, `modifyProfile`, requirements gate) via `ProfileStore`
/ generator / modifier / skill-inventory / installer ports.

## Lazy extension loading

Static imports from `@montflow/pi-profiles` are type-only (erased at
build). The runtime resolves through `loadPiProfiles()` — a cached
dynamic `import()`, first called inside `fetchProfiles` / `saveProfile`
/ the store ports / flow runners, never at dashboard boot.
Consequences:

- A broken or missing extension cannot crash the TUI: the failing load
  toasts `Profiles extension failed to load`, and retry re-imports
  (load failures clear the cache).
- `app.tsx` only knows `Interactive` as structural types plus
  `Profiles.FlowPorts` — the skills and profiles `Interactive` surfaces
  are structurally identical, so the shared TUI adapters satisfy both
  with no conversion. Flow cancellation collapses to `undefined` in the
  runners, so the TUI never touches `CANCELLED`.
- `loadedMatcher()` exposes the shared subsequence matcher to the TUI
  filter picker once a flow has loaded it; the picker only opens
  mid-flow, so pre-load renders fall back to unfiltered rows.

## Belongs here

- `ProfileSummary` rows plus `fromProfile` / `toProfile` bridges
  between dashboard rows and pi-profiles `Profile`
- `isExtensionInstalled` (pi-session check via `pi list`, never fails)
  plus `parseListOutput` (pure, tested) — the session probe behind the
  panel's `extension` boot stage
- `isStoreInstalled` (directory check, never fails) plus
  `installProfiles` (directory seed) — the install keybind behind the panel
- `fetchProfiles` (sorted rows through the loaded module, failing with
  displayable message) — the list method behind the panel
- `deleteProfile` (store directory removal, slug-guarded) plus
  `isValidProfileId` (pure, tested) — the delete keybind behind the detail
- `saveProfile` (directory create plus `encodeProfileFile` through the
  loaded runtime, slug-guarded) — the create keybind and the modify path
- `readRawProfile` — the `readRaw` port for verification flows
- `storeFor` / `skillInventoryFor` / `installerFor` ports for the shared
  `Interactive` flows (inventory and installer reuse the skills service:
  `getSkills` rows as `InstalledSkill`, named installs via the skills CLI)
- Headless agentic runs reuse the skills service (`buildHeadlessPrompt`,
  `runHeadlessAgent`, `listModelLabels`) over workspace-carried copies of
  the author/editor prompts (`AUTHOR_PREPROMPT`, `MODIFY_PREPROMPT`) —
  the extension module owns the canonicals, which are not exported
  through the package index
- `generateFor` / `modifyFor` ports plus `generateAgentic` /
  `modifyAgentic` (name-diff detection, so agent chatter never parses)
- `runCreateFlow` / `runModifyFlow` workspace hosts (manual or agentic
  behind the TUI overlays)

## Does not belong here

- Dialogs, keyboard handling, signals — those live in `app.tsx` plus
  `components/` (`dialogs.tsx` backs the `InteractiveUi` ports)
- Filtering — the `skill-filter` module owns query matching (its
  `Filterable` shape covers profile rows: id, name, description)
