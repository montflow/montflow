# Memory

## Context

Reconcile this spec with main after `spec-optimizations` landed and the
phase-directory layout was flattened by the integration merge. This standard
takes precedence: keep sizing, prompts, doctor, and review budgets; restore the
phase tree; delete the hand-written lock list and the reserved review task; make
the CLI and TUI read the derived phase state.

## Progress

- 2026-11-02: pending, planned. Adds the reconciliation rail between Phase A and
  the Phase B decisions.

## Findings

### Conflict to resolve

- `montflow-phase-directories` is marked complete but its layout is absent from
  main: the merge `1a7d83ac` kept the flat side. This task restores it rather than
  re-planning it.
- `spec-optimizations` (complete, phases A-H) is the source of truth for task
  size, sizing config, catalogue, prompts, doctor, review budgets, and the
  `author` / `execute` / `sizing-config` verbs. Do not duplicate it.
- The shipped `spec-execute` prompt still says `mf-specs` ships no gate runner and
  no lock verb, and teaches hand-edited locks. It must be updated with the tree,
  not left as the authoritative contract.

### Delete list

- `locked-phases` in `SPEC.md` frontmatter and every reader of it.
- `<PHASE>099-review-phase` as a required task and the matching structure check.
- Flat phase derivation from a task-id prefix in the CLI, TUI, prompts, and docs.

## Open Questions

- How a review waiver is recorded is a B004 decision. Until it lands, a phase
  requires a passing review round and B001 records no waiver.

## Handoff

- B003 (tiers) and B004 (v2 contract) start from the restored phase tree and the
  derived-state rail, not from main's flat tree.

## Deviations

- None yet.
