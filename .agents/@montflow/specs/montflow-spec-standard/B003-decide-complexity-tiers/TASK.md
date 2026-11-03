---
id: B003
name: decide-complexity-tiers
type: planning
originator: planner:A099
size: small
depends-on: B001, A001, A002
related-tasks:
status: pending
---

# Task B003: decide complexity tiers

## Type: planning

## Description

Lock the tier vocabulary the appraiser chooses from and what each tier actually buys.
Today nothing distinguishes a hotfix from a multi-package refactor, which is why
both existing specs grew to 15 to 17 task directories. Main has since added a
per-task `size` (`tiny`, `small`, `medium`, `large`) that sets dispatch and the
review-cycle budget; the tier is the spec-level choice above it. Define which
decisions belong to the tier and which stay on the task size.

## Requirements

- A defined enum with one source of truth in code, sized by complexity and requiredness rather than raw task count.
- The relationship between the tier and main's per-task `size`: state exactly which decisions (phases, exploration, task ceiling, review waiver, interaction budget) come from the tier and which stay on `size`, so the two never restate each other.
- Per tier: which phases exist, whether an exploration phase is needed at all, the task ceiling, gate expectations, and whether review is default-required or default-waivable.
- Per tier, the user-interaction budget: how many questions the creation orchestrator may ask. The lowest tier asks almost none, the highest gets the full grilling skill. This is the tier file most important job.
- Above the largest tier the appraiser emits a split verdict naming the proposed cut and the implied spec count, not a tier.
- A test that fails when the tier instruction files, the authoring skill text, or the enum constant drift apart.
- Where the tier instruction files live and how a creation run loads exactly one of them.

## Completion

- [ ] Enum, per-tier artifact matrix, and per-tier interaction budget written to this task MEMORY.md
- [ ] The split verdict specified precisely enough to implement without further decisions
- [ ] B004 and B005 consume these decisions without re-litigating them
