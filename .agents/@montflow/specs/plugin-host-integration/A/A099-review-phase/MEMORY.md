# Memory

## Context

None yet.

## Progress

- pending

## Open Questions

- None.

## Handoff

- See TASK.md.

## Deviations

- None.
# A099: review-phase (phase A) - Memory

## Review (autonomous, no mf-reviews CLI available)
Phase A explored host integration. Evidence gathered:
- Host OpenCode 2.1.4 provides effect 4.0.1; repo pins effect 4.0.0-rc.112, @opencode/plugin/schema 2.0.18. Host forces its own effect copy -> Schema.isStartsWith removed in 4.0.1 breaks @opencode/schema usage in @montflow/opencode.
- Loader restrictions: rejects deep effect/dist/... imports (e.g. effect/dist/unstable/workers/WorkerError.js) reached via package roots/barrels; must use subpaths (platform-node subpaths) and avoid barrels that pull bad deps. apps/doctor pulls problematic imports.
- TUI API: ui.dialog.select exists, keymap.layer with slash commands exists. No supported composer write API - must use renderer.currentFocusedEditor.insertText with retry (failure modes documented).
- Server commands have no toast channel - must post to session via ctx.session.prompt.
- Per-plugin stores/pickers identified. Stopgap duplicates identified for deletion. Pi-era naming inventory started.

## Findings
- Evidence is concrete with file paths/lines. No files outside .agents/@montflow/specs/ modified. Requirements met.
- Note: mf-reviews CLI not installed in environment; review performed autonomously per instructions to work autonomously.

## Verdict
PASS

## B002 retrofit evidence

- 2026-11-02: B002 verified this completed record against this MEMORY, its commits, and the diff.
- Store gate re-run at HEAD: `bun run ts:check`, `bun run lint:check`, `bun run fmt:check`, `bun run test`, and `bun run mf:check` all exit 0; results are quoted in `montflow-spec-standard/B/B002-retrofit-completed-records/MEMORY.md`.
