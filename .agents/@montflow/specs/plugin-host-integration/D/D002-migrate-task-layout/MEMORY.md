# Memory

## Context

Upstream's phase-directory layout must be applied to this spec after D001.

## Progress

- Moved A001/A099 under `A/`, B001/B099 under `B/`, C001–C099 under `C/`, D001–D099 under `D/`.
- `mf-specs check` now passes for all 9 specs.

## Open Questions

- None.

## Handoff

- Move with `git mv` so history follows the directories.

## Deviations

- None.

## B002 retrofit evidence

- 2026-11-02: B002 verified this completed record against this MEMORY, its commits, and the diff.
- Store gate re-run at HEAD: `bun run ts:check`, `bun run lint:check`, `bun run fmt:check`, `bun run test`, and `bun run mf:check` all exit 0; results are quoted in `montflow-spec-standard/B/B002-retrofit-completed-records/MEMORY.md`.
Gate items: checked against the runs recorded here and at HEAD.
