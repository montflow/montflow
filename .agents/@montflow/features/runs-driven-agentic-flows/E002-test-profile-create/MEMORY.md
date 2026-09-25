# Memory

## Context

Task E002: tests for the agentic profile-create-to-runs flow.

## Progress

- 2026-09-23: complete (same `profile-runs` subrun; verified by `profile-verify`).

## Done

- `profiles/tests/create-flow.test.ts`: gate (runs extension missing), dispatch
  (run id, prompt, `DEFAULT_RUN_TOOLS`), completion hook opening the fresh
  profile with its run id, no-fresh-profile failure, invalid-authored-profile
  failure, concurrent-run correlation by final reply, canonical re-encode on
  settle, resume re-attach of `authorCompletion`, real cancel resolving
  `undefined`, and the manual `saved` path.
- `runs/tests/lifecycle.test.ts`: `resumeRun` re-attaches a completion hook;
  single failure display for a missing Pi runtime (no duplicate toast).
- `runs/tests/default-tools.test.ts`: `DEFAULT_RUN_TOOLS` keeps `ask_user` /
  `notify_user` enabled under the allowlist union.
- `runs/tests/parse-list-output.test.ts`: lookalike package names read as
  missing; `isRunsExtensionInstallError` matches only the exact hint.
- `components/tests/keybinds.test.ts`: `g run` hint.
- Runner faked at the service boundary via `Runs.setSessionFactoryLayer(...)`
  and `Runs.setExtensionProbe(...)` (harness in `runs/tests/harness.ts`).
- Manual creation tests keep passing; full suite 322 passed.

## Gates

- workspace format/lint/ts clean; `test` **322 passed**.

## Open Questions

- None.

## Handoff

- E099 reviews Phase E.

## Deviations

- 2026-09-24: the F10 "store-read-failure branch" case no longer exists —
  completion reads raw store directories and decodes each file, so the
  untestable store-list failure branch was removed rather than tested.
- 2026-09-24: the app.tsx toast-routing / `g` keybind wiring is exercised at
  the predicate and service layers; app.tsx has no component test harness.
