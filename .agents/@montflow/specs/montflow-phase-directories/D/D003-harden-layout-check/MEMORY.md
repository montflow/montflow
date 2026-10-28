# Memory

## Context

Task D003: with every tree migrated, delete the legacy tolerance so a task
directory at the spec root is an error again. This is the only strictness flip
in the spec; C002 left the branch deliberately one edit wide.

## Progress

- 2026-10-28: complete. Package suite 448 tests green; repo store and fixtures
  clean of legacy layout.

## Findings

### 1. Verifier

- Removed the `legacyDirs` walk and the F1 `warning`; a root task directory now
  raises the same message and `fix` at error severity.
- `knownPhases` collapsed back to `phaseDirs`; `locked-phases` and the
  per-phase review check iterate the phase directories only.
- `warning` is no longer imported by the structure module; no other finding
  changed severity.

### 2. Tests

- The structure case is now `flags a task directory still at the spec root` and
  asserts one error with the target-path message and `fix`.
- Removed `mock-legacy` and its two tests (`mock-legacy warns…`, `plans one move
  for mock-legacy`); `migrate.test.ts` still covers planning, dry-run, and
  apply against synthetic flat trees, so the verb keeps its coverage without a
  fixture that can no longer be valid.
- `fixtures/README.md` now lists five fixtures, all phase-laid-out.

### 3. Checks

- `bun run --cwd packages/specs test` — 56 files / 448 tests, no type errors.
- `bun run --cwd packages/specs lint:check` — clean.
- `bun run --cwd packages/specs format:check` — clean.
- `bun run --cwd packages/specs ts:check` — clean.
- `bun run --cwd packages/specs fixtures:check` — 5 specs, 3 failed
  (`mock-bad` 10, `mock-stale` 1, `mock-stray` 3), 0 warnings.
- `bun run packages/specs/src/apps/cli/main.ts check` — 7 specs, 0 failed, 0
  issues, 0 warnings.

## Open Questions

- None.

## Handoff

- D004 aligns the skills, both packaged copies, the README, and the CONTEXT
  files; no further verifier change.

## Deviations

- Removed the `mock-legacy` fixture rather than restating it as an error
  fixture: the case is already covered by an in-memory structure test, and a
  flat fixture would now be a permanently failing spec with no migration value.
