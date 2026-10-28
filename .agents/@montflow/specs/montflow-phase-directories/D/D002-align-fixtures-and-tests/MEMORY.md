# Memory

## Context

Task D002: complete the fixture corpus and expectation matrix after D001. The
four original fixtures moved with the verifier in C002; this task adds the two
states the layout makes newly observable and audits the rest.

## Progress

- 2026-10-28: complete. Package suite 452 tests green; 6 fixtures with exact
  verdicts.

## Findings

### 1. Fixture matrix (final for D002)

| Fixture | Layout | Verdict |
| --- | --- | --- |
| `mock-ok` | phase dirs | 0 issues, `pending` |
| `mock-complete` | phase dirs | 0 issues, `complete` |
| `mock-stale` | phase dirs | 1 lifecycle issue, `inconsistent` |
| `mock-bad` | phase dirs | 10 documented issues |
| `mock-legacy` | flat | 1 warning (F1), 0 errors |
| `mock-stray` | phase dirs + stray file + stray dir | 3 errors |

- `mock-legacy` holds only the review task (`A099-review-phase` at the root) and
  a one-row table, so it exercises exactly one F1 warning.
- `mock-stray` is `mock-ok` plus `A/notes.txt` and
  `A/A001-implement-thing/scratch/notes.txt`, producing F4 (stray file in a
  phase), F6 (directory inside a task), and F8 (deep path). An empty phase
  directory cannot be committed to git, so F5 stays covered by the in-memory
  structure test instead of a fixture.
- `fixtures.test.ts` adds: `mock-legacy` warns exactly once with the target path
  and `fix`; `mock-stray` surfaces the three fields; `planMigration` on
  `mock-legacy` plans one move to `A/A099-review-phase`.
- `fixtures/README.md` lists six fixtures with their verdicts and a `migrate
  --dry-run` example.
- No other test pinned a flat path after C002/D001.

### 2. Gates

- `bun run --cwd packages/specs test` — 56 files / 452 tests, no type errors.
- `bun run --cwd packages/specs lint:check` — clean.
- `bun run --cwd packages/specs format:check` — clean.
- `bun run --cwd packages/specs ts:check` — clean.
- `bun run --cwd packages/specs fixtures:check` — 6 specs, 3 failed
  (`mock-bad` 10, `mock-stale` 1, `mock-stray` 3), 1 warning (`mock-legacy`).

## Open Questions

- None.

## Handoff

- D003 deletes the legacy walk and the F1 warning, so `mock-legacy` must be
  removed or restated as an error fixture.

## Deviations

- `mock-stray` covers F4 + F6 + F8 instead of F5 + F4: git cannot track an empty
  directory, so F5 has no on-disk fixture. Recorded here.
