# Sizing module

Task sizing vocabulary and its pure engine: the four sizes, the review-cycle
budget they buy, the layered `sizing.json` contract (repo root and spec root),
coded verification, and the repo → spec → phase merged resolver. Every other
module reads `SIZES` and the config shapes from here instead of restating
them.

## Belongs here

- `SIZES` / `Size` / `isSize` / `DEFAULT_SIZE`
- Review budgets: `REVIEW_CYCLES`, `MAX_REVIEW_CYCLES`, `reviewCycles`,
  `taskContribution` (the one per-input rule: a `review` task and an unsized
  task contribute `0`, a sized one its cycles, a bare size its cycles),
  `phaseReviewBudget` (the fold over it, floored at 1 for a non-empty phase)
- Config shapes and patterns: `SizeEntry`, `SizingConfig`, `PhaseConfig`,
  `MODEL_PATTERN`, `EFFORT_PATTERN`, `CONFIG_FILE`
- Coded diagnostics: `CODES`, `SizingError`, `verify`, `verifyText`, `parse`.
  Both text entry points parse JSON themselves so the original `SyntaxError`
  (position included when the runtime reports one) reaches the cause;
  `Schema.fromJsonString` is deliberately not used. `verify` owns the contract
  and its coded messages; `parse` then runs one strict schema decode
  (`onExcessProperty: 'error'`) to narrow the verified JSON.
- Precedence: `merge`, `mergedEntry`, `resolve`, `targetOf`, `INHERIT`

## Does not belong here

- `TASK.md` frontmatter parsing and task-size enforcement — `task` owns it
- Which files a spec root may hold — `structure` owns it
- CLI rendering of targets and provenance — the `cli` app owns it
- Reading files from disk — `spec-store` owns it
