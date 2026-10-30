# Memory

## Context

A001 decided the contract; this task implements it. Result:

- `src/modules/fallback-store/` owns the store: `file`/`directory`, `decode`
  (field-scoped issues), `read`, `resolve`/`resolveWith` (store → options → idle),
  `write` (atomic, unknown keys preserved, `changed` flag), `remove`, and
  `watch` (nearest existing ancestor, scoped).
- `src/apps/server/model-fallback.apps.module.ts` resolves at activation, keeps
  the active config in a `Ref`, re-resolves on store changes, and logs every
  issue. Hooks read the `Ref`, so a swap applies on the next failure without
  re-registering anything. An invalid store never replaces the last good config.
- `src/apps/cli/engines.apps.module.ts`: `show`/`set`/`status`/`verify` read the
  store; `migrate` writes the store and clears legacy `opencode.jsonc` options;
  `remove` deletes the store and clears the options while keeping the entry.
  `legacyStrict` fails on a broken host config (`migrate`), `legacy` tolerates it
  so a valid store always wins.
- `FallbackFile` is legacy-only now: `read`, `locate`, `clearOptions`. The dead
  `write`/`remove` were removed with their tests.
- TUI calls the CLI engines directly, so the dialog face and the binary cannot
  disagree. The packaged prompt and README describe the store, `status`, and
  `migrate`.
- The workspace dogfooded `migrate`: the repo's own chain now lives in
  `.agents/@montflow/model-fallback/config.json` and `opencode.jsonc` keeps only
  the package entry.
- The root gate runs `status` alongside `doctor --check`.

## Progress

- complete — store, runtime reload, CLI/TUI/prompt migration shipped; tests and
  gates green.

## Issues found and fixed

- A malformed `opencode.jsonc` used to shadow a valid store because `legacy()`
  failed the whole read. Split into `legacyStrict` (migrate) and tolerant `legacy`
  (show/status/verify/set); regression tests added.
- `FallbackFile.write`/`remove` became dead when writes moved to the store;
  removed with their tests instead of leaving two writers.

## Open Questions

- None.

## Deviations

- The store is strict JSON, as decided; `jsonc-parser` now only touches the
  legacy host config.

## Handoff

- A003 adds `status`'s exit-code matrix and gate wiring (implemented here in
  practice; A003 records and tests it).
