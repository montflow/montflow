# Memory

## Context

Task B007: remediate Phase B review findings using subruns (B006).

## Progress

- 2026-09-23: complete.

## Orchestration

`packages/pi-runs/tmp/fix-subruns.ts` dispatched, under parent
`fix-coordinator` and `related: ['review-phase-b']`:

- `fix-runner` (F1, F3, F4, F13, F16) — also removed dispatcher user-turn
  writes, added `Store.unpark`, mirrored Pi's own user `message_end`s.
- `fix-store` (F6, F7, F11, F12, F15, F17, F19) — replay message validation,
  stale-lock reclaim, receipt id check, verified load, per-run list isolation,
  locked create, persisted question.
- `fix-package` (F18) — removed unused `@montflow/pi-effect`, resynced lockfile.
- `fix-verify` — audited F1–F19, added test-only coverage (88 tests).

## Result

- Resolved: F1–F7, F9, F11–F19.
- **F8 open** — tools allowlist not persisted; `resume` hardcodes `undefined`.
- **F10 partial** — `toPort`/`interactionTools`/factory-create tests blocked
  because `toPort` is module-private.
- Gates independently re-run: format/lint/ts clean, 88 tests pass.

## Open Questions

- None.

## Handoff

- B008 fixes F8; B009 fixes F10's blocked coverage.

## Deviations

- `fix-runner` edited the store module (needed `Store.unpark`); ran concurrently
  with `fix-store`, but the verification run confirmed the combined tree passes.
