---
id: D004
name: review-phase
type: review
originator: user
size: medium
depends-on: D001, D002, D003
related-tasks:
reviewer-profiles:
status: complete
---

# Task D004: review-phase

## Type: review

## Description

Independent hostile review of Phase D: the profile-discovery work and the lean
execution contract. Confirm the shipped prompts/profiles/check actually enforce
the contract, that every pending phase carries the brief, and that the
mechanical verification fails when the guidance is removed.

## Requirements

- Review is written as a series round at
  `.agents/@montflow/reviews/montflow-spec-standard/<NNN>/REVIEW.md` with
  `- Phase: D` in `## Metadata`, and the series ledger indexes it.
- The review verifies the lean contract is present in the canonical and
  installed worker/orchestrator profiles and the `spec-execute` prompt, and that
  removing a marker fails the drift test.
- The review proves `mf-specs check` reports `phase.execution-brief-missing` for
  a phase without the brief and passes when every v2 in-progress phase has one.
- The review checks that the pending task records point at the phase brief and
  that no task duplicates a command already named in its `GATES.md`.
- Accepted findings are opened as defect tasks with dispositions recorded;
  `mf:check` and `mf-specs:check` are green.

## Execution

Follow the phase `MEMORY.md` `## Execution Brief`: read only this task, that
brief, and the scoped source; run each gate once; keep this task's `MEMORY.md`
under 80 lines; batch review findings into one fixer attempt.

## Completion

- [x] The round is written under `.agents/@montflow/reviews/montflow-spec-standard/<NNN>/REVIEW.md` with `- Phase: D`, and the series ledger indexes it.
- [x] The review proves the lean markers in the canonical and installed profiles/prompt and that removing one fails the drift test.
- [x] The review proves `phase.execution-brief-missing` fires on a fixture and is silent on this spec.
- [x] Findings are opened as defect tasks with dispositions recorded and accepted fixes applied.
- [x] `bun run mf:check` and `bun run mf-specs:check` pass.
