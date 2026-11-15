# Memory

## Context

B001 surfaces the tracking-vs-pinned distinction in `status`, `verify`, and the
renderers: a branch-named `ref:` is `tracking <branch>`; a commit/tag is
`pinned to <sha>`. The data structures carry the classified kind so renderers
never re-parse the ref string.

## Progress

- `git.module.ts`: added `classifyRefSpelling(ref)` (commit via COMMIT_PATTERN,
  tag via isTagCandidate, else branch) and exported `sha7`.
- `lifecycle.module.ts`: `StatusRow` gains `refKind` and `pin`; the pinned
  `status` row sets `refKind: classifyRefSpelling(ref)` and
  `pin: observed.resolvedRefHead` (full resolved sha, so an abbreviated stored
  hash is normalized).
- `engines.apps.module.ts`: `ReferenceRow` gains `refKind`; `list` classifies it.
- `renderers.apps.module.ts`: `refKindSuffix` prints `tracking <branch>` (from
  upstream) or `pinned to <sha7>` (full 40-hex with `--verbose`) in agent and
  human status modes; `listRef` prints `ref=branch:main` vs `ref=commit:abc1234`
  in the `list --verbose` ref column.
- `verifier.module.ts`: `verifyClone` ref findings attribute to the classified
  kind ("tracking" for a branch, "pinned to" for commit/tag).

## Findings

- `ts:check` clean; B001-scoped suite passes (276 tests), including new
  renderer tests for the pinned/tracking status output and the verbose list
  ref column.

## Gates

- B001 GATES Stage 0 command runs the cli+verifier+git suites; 276 tests pass.

## Open Questions

- None.

## Handoff

- B002 aligns the skill and docs to the same vocabulary.

## Deviations

- None.

## Execution

- Read: phase MEMORY Execution Brief, TASK.md/GATES.md, scoped source.
- Write scope: TASK.md files only.
- Record: MEMORY.md at or under 80 lines; logs at /tmp/B001-status-verify-ref-kind.log.