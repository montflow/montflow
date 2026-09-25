# Memory

## Context

Task E001: wire agentic profile creation to the run engine.

## Progress

- 2026-09-23: complete (dispatched as `profile-runs` subrun).

## Done

- **Gate:** `Runs.runsExtensionInstalled(root)` (parses `pi list` for
  `pi-runs`) + `RUNS_EXTENSION_INSTALL_HINT`; the create flow fails with the
  hint, toasted as a warning. The gate now runs at `runCreateProfile` entry
  (before the dialog), not after the mode select + requirements + description
  + model picker.
- **Interception:** the workspace `generateFor` now dispatches
  `Runs.startRun(root, { prompt: AUTHOR_PREPROMPT + injected skills + description
  + AUTHOR_POSTPROMPT, model, tools: [...Runs.DEFAULT_RUN_TOOLS], onSettled })`
  and unwinds the shared flow with `CANCELLED`. `runCreateFlow` returns a union:
  `{ kind: 'saved', profile } | { kind: 'dispatched', runId } | undefined`.
- **Toast + keybind:** `createProfileMutation.done` toasts
  `Run '<id>' is creating your profile — press g to view`; `lastDispatchedRunId`
  + global `g` keybind (`Keybinds.goToRun`) open the run detail; status hint updated.
- **Completion:** `onSettled` (now `authorCompletion`, reusable) reads the raw
  store dirs fresh since dispatch, decodes them, and correlates the created
  profile to the run's final assistant reply (name-diff fallback only when a
  single fresh profile exists). The chosen profile is re-encoded through
  `saveProfile` (decode+encode canonicalization), then the detail opens and the
  runs list refreshes. Invalid authored profiles report distinctly from nothing
  written.
- **Resume:** `Runs.resumeRun` accepts an `onSettled` hook; the engine's
  `Runner.resume` re-attaches it, so a resumed author run still fires the
  completion path (tested end to end).
- Manual creation and modify/fix/skills/prompts flows unchanged;
  `Skills.runHeadlessAgent` remains only in `modifyAgentic`.

## Gates

- workspace format/lint/ts clean; `test` **322 passed**; pi-runs 137 passed.

## Open Questions

- None.

## Handoff

- E002 covers tests; E099 reviews Phase E.

## Deviations

- 2026-09-24: A004 decision 5 named a `/mf-profiles-cli create …` invocation
  on the `onSettled` seam. The create path instead decodes the authored file
  and re-encodes it through `PiProfiles.decodeProfileFile` +
  `saveProfile` (`encodeProfileFile`) on settle — the same validation and
  canonical persistence the CLI performs, without spawning a nested pi
  session. Recorded here as an amendment; A004 updated to match.
- 2026-09-24: F7 gate is now checked at `runCreateProfile` entry, so a missing
  runs extension blocks the whole create flow (manual included) before the
  dialog. The shared `Interactive.createProfile` cannot gate only its agentic
  branch without a `pi-profiles` change; gating at entry is the E001
  "missing extension → install prompt" requirement.
- 2026-09-24: F4 re-attach is engine/API-level — the workspace has no resume
  keybind yet, so a resumer must pass `authorCompletion` to `resumeRun`.
  The TUI auto-resume path remains deferred.
