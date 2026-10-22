# Profiles service

Reads workspace profiles (`.agents/@montflow/profiles/<name>/PROFILE.md`) for the
dashboard's Profiles panel: rows decoded through the lazily loaded
`@montflow/profiles` runtime into `ProfileSummary` rows, plus the CRUD,
verification, and change-stream surfaces the grid page and workspace report use.

## Lazy extension loading

Static imports from `@montflow/profiles` are type-only (erased at build). The
runtime resolves through `loadPiProfiles()` — a cached dynamic `import()`, first
called inside `fetchProfiles` / `saveProfile`, never at dashboard boot.
Consequences:

- A broken or missing extension cannot crash the TUI: the failing load toasts
  the classified message, and a retry re-imports (load failures clear the cache;
  `resetExtensionCache` drops it in tests).
- `classifyLoadError` splits `network` from `missing` from `unknown`, so the
  toast tells the user whether to retry or reinstall.

## Belongs here

- `ProfileSummary` rows plus `fromProfile` / `toProfile` bridges between
  dashboard rows and `PiProfiles.Profile`
- `fetchProfiles` (sorted rows through the loaded module, failing with a
  displayable message) — the list method behind the panel and the report
- `deleteProfile` (store directory removal, slug-guarded) plus
  `isValidProfileId` (pure, tested) — the delete keybind behind the detail
- `saveProfile` (directory create plus `encodeProfileFile` through the loaded
  runtime, slug-guarded), `readRawProfile`, and `verifyProfile`
- `watchProfileChanges` — subscribes to the extension's `ProfileStore.watch`
  stream (building the store over the Node platform layers) and forwards each
  change as a dashboard row; `applyProfileChange` (pure, tested) patches a
  cached list snapshot for created/updated/removed
- `storeFor` / `skillInventoryFor` — structural store ports over the native
  files (no consumer in the plugin faces yet)

## Does not belong here

- Dialogs, keyboard handling, signals — those live in `grid-page.tsx` and
  `components/`
- Filtering — the `skill-filter` module owns query matching
- Authoring flows — `/mf-profiles` and `profile_execute` own them in
  `@montflow/profiles`'s plugin faces
