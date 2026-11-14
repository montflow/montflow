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

## Retrofit record

Both packaged skills document the shipped CLI, including the routed add→update notice and the `--human`/`--verbose` modes. Evidence: commits `6eeb3443 docs(skills): align the reference skills with the shipped CLI` and `ca09f161`; current `packages/references/skills/montflow-add-reference/SKILL.md` and `montflow-find-reference/SKILL.md` carry both. No stale `adding-references`/`finding-references` name or registry table remains in either skill.

## B002 retrofit evidence

- 2026-11-02: B002 verified this completed record against this MEMORY, its commits, and the diff.
- Store gate re-run at HEAD: `bun run ts:check`, `bun run lint:check`, `bun run fmt:check`, `bun run test`, and `bun run mf:check` all exit 0; results are quoted in `montflow-spec-standard/B/B002-retrofit-completed-records/MEMORY.md`.
Gate items: checked against the runs recorded here and at HEAD.
