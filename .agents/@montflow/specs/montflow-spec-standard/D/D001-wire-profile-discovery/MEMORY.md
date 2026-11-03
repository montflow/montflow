# Memory

## Context

Wire profile discovery into spec authoring. The `spec-create` prompt and the
`montflow-create-specs` skill currently point the author at
`.agents/@montflow/profiles/` and leave the profiles CLI unnamed, so a declared
profile can be missed. This task makes `mf-profiles list` the discovery step,
`mf-profiles show` the deep read, and states that a small, fully gated phase may
ship without a review task.

## Progress

- 2026-11-02: pending, not started.

## Open Questions

- Phase D has no review task by design: D001 is small and gated. B004 decides
  the waiver file and field, so the reason is recorded here and in `SPEC.md`
  until `PHASE.md` carries it.

## Handoff

- B004 owns the review-waiver record; this task only states the authoring rule.
- C006 and C007 rewrite the shipped prompts and docs this task extends, so land
  their v2 text first and keep the discovery instruction verbatim.

## Deviations

- None yet.
