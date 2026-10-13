---
id: B001
name: decide-series-and-profile-convention
type: planning
originator: user
depends-on: A003
related-tasks:
status: pending
---

# Task B001: Decide the series and profile convention

## Type: planning

## Description

Decide the exact convention for declaring reviewer profiles on a review task
and for naming the resulting series, so the verifier and the orchestrator agree.

## Requirements

- Decide the review-task declaration: the frontmatter field name, whether order is significant, and the empty-list default that preserves today's behavior.
- Decide the derived series naming for the default and additional profiles, keeping every series name a valid slug and collision-free.
- Decide how the phase-to-round mapping stays identical across every series.
- Decide how an unknown profile is reported by the verifier and by dispatch.
- Record the decision with its rationale and the A-task evidence it rests on, and list rejected alternatives.

## Completion

- [ ] Declaration field and series naming recorded
- [ ] Unknown-profile and round-mapping behavior decided
- [ ] Rejected alternatives recorded
