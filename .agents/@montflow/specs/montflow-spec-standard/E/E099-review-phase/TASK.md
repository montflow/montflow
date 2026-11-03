---
id: E099
name: review-phase
type: review
originator: user
size: medium
depends-on: E001, E002, E003
related-tasks:
status: pending
---

# Task E099: review the parallel execution phase

## Type: review

## Description

An independent hostile review of the parallel execution contract and its
implementation: does the authoring flow actually produce wide ready sets, do the
channels speed coordination without smuggling in dependencies, and can two agents
ever launch the same heavy verification twice.

## Requirements

- Audit the phase-shape rule against the authoring artifacts: a serial phase is
  explained, write scopes are declared, and colliding tasks carry a dependency or
  are split.
- Verify the two gate layers: task gates are scoped to the task, shared checks
  are named once at phase level, and no task gate copies a repo-wide suite.
- Attack the scheduler: two concurrent requesters for one key, a fingerprint
  change, a failed run, an expired lease, and a stale green. Confirm no path
  returns a pass that was not run against the current inputs.
- Confirm the lane bound actually prevents two heavy commands from running at
  once, and that a light check is not stuck behind the heavy lane.
- Confirm the board and mailbox are used as decided: broadcast facts, targeted
  questions, no substitute for `depends-on`, delivery to a live session and
  queueing to an absent one.
- Confirm the execution prompt and profiles dispatch the full ready set
  concurrently and run shared verification once.

## Completion

- [ ] Review written to `.agents/@montflow/reviews/montflow-spec-standard/E.md` and read by the human
- [ ] Every finding about a duplicate run, a stale green, or a dependency smuggled into a channel has a disposition
- [ ] `bun run mf:check` green with the scheduler tests in place
