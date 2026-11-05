---
id: G099
name: review-phase
type: review
originator: user
size: medium
depends-on: G001, G002, G003, G004, G100
related-tasks:
status: complete
---

# Task G099: review the conditional-variable phase

## Type: review

## Description

An independent hostile review of the conditional-variable contract and its
implementation: can a hidden branch still be asked, required, rendered, or
resurrected from a stale answer, and do the verifier, interactive fill, CLI, and
workspace editor agree on one visibility rule?

## Requirements

- Attack the condition grammar: unknown controller, a controller declared
  later, a text controller, a value outside the controller's options, and a
  template guard with no matching condition. Confirm each is refused with a
  precise fix.
- Confirm a hidden required variable is never missing and renders empty, and
  that yes→no→yes cannot reuse a stale worktree name.
- Compare the four consumers — `verify`, `render`, `fillInputs`, and the
  workspace editor — on the same prompt and values; a disagreement is a finding.
- Confirm every installed prompt and package prompt still verifies and renders
  unchanged after the schema extension.
- Confirm the authoring rules and the packaged create-prompts skill both teach
  the condition field and the guard rule, and that the drift test covers them.

## Execution

Follow the phase `MEMORY.md` `## Execution Brief`: read only this task, that brief, and the scoped source; run each gate once; keep this task's `MEMORY.md` under 80 lines; batch review findings into one fixer attempt.

## Completion

- [x] Review written to the series
      `.agents/@montflow/reviews/montflow-spec-standard/013/REVIEW.md` (re-review
      014) and read by the human
- [x] Every finding about a hidden branch being asked, required, rendered, or
      resurrected has a disposition
- [x] `bun run mf:check` green with the conditional-variable tests in place
