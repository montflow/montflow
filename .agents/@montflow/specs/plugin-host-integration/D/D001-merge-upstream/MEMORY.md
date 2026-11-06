# Memory

## Context

Reconcile `origin/main` commit `3cf8150` (phase directories for every spec task)
into the plugin-host-integration branch.

## Progress

- Merged `origin/main` (`3cf8150`) as `c65063d`.
- Conflicts resolved: bookkeeper table keeps the retired names + upstream's phase wording; both create-specs skills keep the retired name + upstream's phase description; `cli.apps.module.ts` took upstream's phase-aware engine and re-applied the slash/commands split on top (binary-only imports stay out of the server graph).
- All five package suites pass on the merged tree. The only red check is the spec layout, which upstream now requires and D002 migrates.

## Open Questions

- None.

## Handoff

- Start by reading the conflict set from `git merge-tree`.

## Deviations

- None.

## B002 retrofit evidence

- 2026-11-02: B002 verified this completed record against this MEMORY, its commits, and the diff.
- Store gate re-run at HEAD: `bun run ts:check`, `bun run lint:check`, `bun run fmt:check`, `bun run test`, and `bun run mf:check` all exit 0; results are quoted in `montflow-spec-standard/B/B002-retrofit-completed-records/MEMORY.md`.
Gate items: checked against the runs recorded here and at HEAD.
