# Memory
# C003: wire-plugin-pickers - Memory

Wiring all five plugins to use shared picker from @montflow/opencode/tui.

## Context
Wired prompts, skills, specs, profiles, reviews to shared picker.

## Progress
- Added picker usage in all plugins.
- Deleted stopgap .opencode/plugins/prompts.

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
