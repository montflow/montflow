---
id: D002
name: align-fixtures-and-tests
type: execution
originator: planner:C099
depends-on: D001
related-tasks:
status: complete
---

# Task D002: align-fixtures-and-tests

## Type: execution

## Description

The four fixtures moved with the verifier in C002; this task completes the
fixture corpus and its expectation matrix. It adds the two states the layout
makes newly observable — a legacy flat tree that warns, and a stray-directory
tree that errors — and records the verdicts the fixture README promises.

## Requirements

- Audit the four migrated fixtures and re-run them with the `migrate` verb to
  prove the verb is a no-op on them; do not re-move them.
- Add `mock-legacy`: a flat tree that verifies with exactly one warning naming
  its target path (removed again in D003 when the warning became an error).
- Add `mock-stray`: an unexpected file inside a phase directory and an
  unexpected directory inside a task directory, each producing its own error
  (plus the deep path its file implies).
- Update `src/apps/cli/tests/fixtures.test.ts` to the two new fixtures and to the
  exact expected fields and counts; add a `planMigration` case for the legacy
  tree.
- Update `packages/specs/fixtures/README.md` with the fixture matrix, the issue
  counts, and the migrate commands (D003 later drops `mock-legacy`).
- Update any remaining test that pins a flat path — structure snapshots, store
  expectations, scaffold/create/next/status/list — and do not weaken an
  assertion to make it pass.
- Keep the corpus verdicts exact: `mock-ok` and `mock-complete` clean;
  `mock-stale` fails on its one lifecycle finding; `mock-bad` fails on its
  documented classes; `mock-legacy` warns only; `mock-stray` errors on the stray
  file, the directory, and the deep path.

## Completion

- [x] `bun run --cwd packages/specs fixtures:check` exits with the documented verdicts
- [x] `bun run --cwd packages/specs test` passes
- [x] `mock-legacy` reported exactly one warning before D003 removed it
- [x] `mock-stray` reports its stray-file, directory, and deep-path findings
- [x] The fixtures README lists the five surviving fixtures with their exact verdicts
