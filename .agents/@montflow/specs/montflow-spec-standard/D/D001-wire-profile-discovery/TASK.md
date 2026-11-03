---
id: D001
name: wire-profile-discovery
type: execution
originator: user
size: small
depends-on: C006, C007
related-tasks: B004
status: pending
---

# Task D001: wire profile discovery into spec authoring

## Type: execution

## Description

Finding a reviewer is still a directory read. The shipped `spec-create` prompt
and the `montflow-create-specs` skill both say to read
`.agents/@montflow/profiles/`, and neither names the profiles CLI. That makes
discovery depend on the author choosing to open the directory, so a declared
profile whose focus fits the phase is easy to miss. The store's own `list`
output already pairs every name with its description — the exact signal a
reviewer choice needs — and `show` supplies the instructions and review
checklist when a description is not enough. Make that the discovery step the
author actually runs, and state the review rule the phase author applies: a
small, fully gated phase may stop at its gates.

## Requirements

- The `spec-create` prompt names the profiles CLI as the step before choosing
  `reviewer-profiles`: `mf-profiles list` in the binary and `/mf-profiles list`
  in the host. The author does not guess the store's contents.
- `mf-profiles show <name>` is the follow-up when a description does not settle
  the choice; it reports the profile's instructions and review checklist.
- The `montflow-create-specs` skill carries the same instruction in the
  `reviewer-profiles` rule and in the Reference: list first, show when needed,
  and declare a profile only when its focus matches the phase's work.
- The prompt and the skill state that an empty `reviewer-profiles` list is the
  default on every phase, and that a declared profile adds one round per cycle
  without changing the phase budget.
- The prompt and the skill state that a phase is not required to carry a review
  task. A small phase whose tasks are fully gated may end at its gates, and the
  waiver reason is recorded; B004 decides the file and field that carry it.
- The README's multi-reviewer section documents the discovery step, the
  `show` fallback, and the empty-list default.
- The package skill, the installed workspace mirror, and the doctor embedded
  payload carry identical bytes; `mf-specs doctor --check` reports no drift.
- A test fails when the discovery instruction is removed from the rendered
  `spec-create` prompt or the skill's `reviewer-profiles` rule.
- The change adds no new `mf-specs check` finding to any spec.

## Execution

Follow the phase `MEMORY.md` `## Execution Brief`: read only this task, that brief, and the scoped source; run each gate once; keep this task's `MEMORY.md` under 80 lines; batch review findings into one fixer attempt.

## Completion

- [ ] A rendered `spec-create` prompt tells the author to run `mf-profiles list` before choosing `reviewer-profiles`
- [ ] The skill's `reviewer-profiles` rule and Reference name `mf-profiles list` and the `show` fallback
- [ ] The README documents profile discovery and the empty-list default
- [ ] The package skill, workspace mirror, and embedded payload agree, and `mf-specs doctor --check` is silent
- [ ] A test covers the prompt and skill discovery text
- [ ] `ts:check`, `lint:check`, `fmt:check`, and `mf-specs:check` pass
