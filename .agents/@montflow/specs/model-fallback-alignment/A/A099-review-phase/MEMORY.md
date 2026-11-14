# Memory

## Context

Phase A was reviewed by an independent adversarial reviewer across five rounds
(series `model-fallback-alignment`, local under `.agents/@montflow/reviews/`,
which the repo gitignores). The series closed with no open findings.

- 001: 17 findings (1 critical, 5 major, 7 minor, 4 nit).
- 002: 7 resolved; 9 reopened; 4 new (watcher and read-path behaviour).
- 003: 9 resolved; 3 reopened (Bun `fs.watch` never reports dot entries).
- 004: 8 resolved; one defect left (`EACCES` read as absent) and missing reload
  tests.
- 005: `F27` and `F6` resolved, no new findings; `F28`/`F29` closed as `Won't Fix`
  (file-derived ANSI in a migrate failure line, stale CONTEXT wording).

Material outcomes: the `fs.watch` design was replaced by a scoped one-second
`changeToken` poll (Bun emits no events for `.agents`), the last-good chain is
kept by `adopt` on any issue, read errors are issues rather than failures, and
the gate now exercises valid and invalid store fixtures.

## Progress

- complete — review series closed at round 005.

## Open Questions

- None.

## Handoff

- Phase A is complete; the branch is ready for its PR.

## Deviations

- The documented "watch" is a poll; `fs.watch` cannot observe dot-named entries
  in the Bun host. Recorded in the store CONTEXT and the review.

## B002 retrofit evidence

- 2026-11-02: B002 verified this completed record against this MEMORY, its commits, and the diff.
- Store gate re-run at HEAD: `bun run ts:check`, `bun run lint:check`, `bun run fmt:check`, `bun run test`, and `bun run mf:check` all exit 0; results are quoted in `montflow-spec-standard/B/B002-retrofit-completed-records/MEMORY.md`.
