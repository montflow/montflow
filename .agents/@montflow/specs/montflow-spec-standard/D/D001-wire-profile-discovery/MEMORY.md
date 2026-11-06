# Memory

## Context

Wire profile discovery into spec authoring. The `spec-create` prompt and the
`montflow-create-specs` skill pointed the author at
`.agents/@montflow/profiles/` with the profiles CLI unnamed. This task makes
`mf-profiles list` the discovery step, `mf-profiles show` the deep read, and
states that a small, fully gated phase may ship without a review task.

## Progress

- 2026-11-03: implemented. Prompt §8, skill rule + Reference, README
  discovery paragraph, skill 2.13.1→2.14.0 with changelogs, new
  `profile-discovery.test.ts`, payload regenerated, mirrors repaired.
- All gates pass: package suite 132 files / 1839 tests; ts, lint, fmt clean;
  `mf-specs:check` 0 issues; `doctor --check` silent; mirror byte-identical.

## Findings

- First `reviewer-profiles` hit in prompt §4 is the `--reviewer-profiles` flag;
  the discovery-before-choice order is asserted inside §8 against the
  `Declare a profile only when` decision sentence.
- Skill prose wraps mid-phrase, so the test normalizes whitespace (`flat()`)
  before asserting.
- `doctor --check` covers installed CHANGELOG + prompt copies too; repair
  (not hand-copy) is the sync path for those.

## Gates

- Stage 0: `cli author --request "ship a small fix"` renders `mf-profiles
  list`, `/mf-profiles list`, `mf-profiles show`, `/mf-profiles show`.
- Stage 1: `cmp` package skill vs workspace mirror identical; doctor silent.
- Stage 2: stripping `mf-profiles list` fails 3/4 discovery tests (proven).
- Stage 3: `bun run --cwd packages/specs test` passes. Log: `/tmp/D001.log`.

## Open Questions

- Phase D is a required, reviewed phase: D004 (`D004-review-phase`) reviews the
  phase and closes its round. The earlier note that Phase D had no review task
  by design is superseded.

## Handoff

- B004 owns the review-waiver record; this task only states the authoring rule.
- Orchestrator: tick completions, run the official task gate once.

## Deviations

- None.
