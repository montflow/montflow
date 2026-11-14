# Memory

## Context

Phase E removes internal Pi-era names and guards the tree.

## Progress

- Renamed `modules/pi-profiles/` to `modules/profile/` (`profile.module.ts`), renamed the `PiProfiles` namespace to `Profiles` across the package and workspace, and dropped the redundant `PiProfile` alias. Profiles (26 files) and workspace (48 files) suites pass.

## Open Questions

- None.

## Handoff

- Keep behaviour identical; this phase is a rename and a guard.

## Deviations

- None.

## B002 retrofit evidence

- 2026-11-02: B002 verified this completed record against this MEMORY, its commits, and the diff.
- Store gate re-run at HEAD: `bun run ts:check`, `bun run lint:check`, `bun run fmt:check`, `bun run test`, and `bun run mf:check` all exit 0; results are quoted in `montflow-spec-standard/B/B002-retrofit-completed-records/MEMORY.md`.
Gate items: checked against the runs recorded here and at HEAD.
