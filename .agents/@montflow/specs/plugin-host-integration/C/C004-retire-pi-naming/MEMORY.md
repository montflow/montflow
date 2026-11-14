# Memory
# C004: retire-pi-naming - Memory

Removing pi- from user-facing surfaces. Store migration, skill renames, command cleanup.

## Context
Migrated prompts store, renamed skills, updated docs.

## Progress
- Moved store to .agents/@montflow/prompts with legacy fallback.
- Renamed packaged skills.
- Removed pi-naming from user surfaces.

## Open Questions
- None.

## Handoff
Done.

## Deviations
- None.

## B002 retrofit evidence

- 2026-11-02: B002 verified this completed record against this MEMORY, its commits, and the diff.
- Store gate re-run at HEAD: `bun run ts:check`, `bun run lint:check`, `bun run fmt:check`, `bun run test`, and `bun run mf:check` all exit 0; results are quoted in `montflow-spec-standard/B/B002-retrofit-completed-records/MEMORY.md`.
Gate items: checked against the runs recorded here and at HEAD.
