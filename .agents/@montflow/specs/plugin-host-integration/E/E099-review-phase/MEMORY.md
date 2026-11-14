# Memory

## Context

Phase E closes when the eradication and its guard are reviewed.

## Progress

- Round 004 written for both series; the reviewers found two majors each: surviving `loadPi*` exports and a guard that missed them, plus fail-open file reads.
- Fixer pass closed both: all `loadPi*` exports renamed, guard patterns broadened with fail-closed reads, a scan floor, and a 7-case test; the retired model-file decoders were deleted.
- Ledgers updated; `mf-reviews verify` reports 10 files, 0 issues.

## Open Questions

- None.

## Handoff

- Run the adversarial reviewer on the eradication diff.

## Deviations

- None.

## B002 retrofit evidence

- 2026-11-02: B002 verified this completed record against this MEMORY, its commits, and the diff.
- Store gate re-run at HEAD: `bun run ts:check`, `bun run lint:check`, `bun run fmt:check`, `bun run test`, and `bun run mf:check` all exit 0; results are quoted in `montflow-spec-standard/B/B002-retrofit-completed-records/MEMORY.md`.
