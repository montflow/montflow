---
id: F099
name: review-phase
type: review
originator: user
size: medium
depends-on: F001, F002
related-tasks:
status: pending
---

# Task F099: review the dependency-integrity phase

## Type: review

## Description

An adversarial review of the dependency rules and their implementation: can a
spec still pass `check` and then deadlock, or fail a graph that is actually
runnable? Does the complete-before-dependency rule ever flag legitimate work?

## Requirements

- Attack the own-phase review rule with direct, transitive, and earlier-phase
  dependencies; confirm the passing and failing cases both exist as fixtures.
- Confirm the complete-before-dependency rule agrees with the ready set, and
  that an unknown dependency is reported once.
- Confirm duplicate ids and dangling or self `related-tasks` findings are
  precise and name the record to edit.
- Run every spec in the store through the verifier; no spec may gain a finding
  from the new rules.
- Confirm the module contexts describe the rules and the tests would fail if a
  rule were removed.

## Execution

Follow the phase `MEMORY.md` `## Execution Brief`: read only this task, that brief, and the scoped source; run each gate once; keep this task's `MEMORY.md` under 80 lines; batch review findings into one fixer attempt.

## Completion

- [ ] Review written to `.agents/@montflow/reviews/montflow-spec-standard/F.md`
      and read by the human
- [ ] Every finding about a missed or false contradiction has a disposition
- [ ] `bun run mf:check` green with the new rules in place
