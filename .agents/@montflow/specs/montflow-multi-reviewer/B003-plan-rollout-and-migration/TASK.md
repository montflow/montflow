---
id: B003
name: plan-rollout-and-migration
type: planning
originator: user
depends-on: B001, B002
related-tasks:
status: pending
---

# Task B003: Plan rollout, migration, and the effect-reviewer binding

## Type: planning

## Description

Plan how the change rolls out without breaking existing specs and review
series, and record the concrete effect-reviewer binding for code phases.

## Requirements

- Decide the backward-compatibility guarantee for specs and series with no declared profiles.
- Decide the migration for existing specs and review series, including whether any existing review task gains a profile and how a new series is seeded.
- Decide the effect-reviewer binding: which phase kinds declare it, its model pin, and how it joins the general reviewer.
- Specify the ordered execution phases for Phase C, each with a cut criterion and rollback.
- Decide the documentation and changelog updates and the verification that closes the spec.
- No file outside `.agents/@montflow/specs/` is modified.

## Completion

- [ ] Backward-compatibility and migration decisions recorded
- [ ] Effect-reviewer binding recorded
- [ ] Execution order with cut and rollback captured
