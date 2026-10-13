---
id: C002
name: implement-multi-series-review-link
type: execution
originator: user
depends-on: B003, C001
related-tasks:
status: pending
---

# Task C002: Generalize the review link to multiple series

## Type: execution

## Description

Teach the review link to accept a set of expected series, one per declared
reviewer profile, so a phase's review task can be backed by more than one
series.

## Requirements

- Derive the expected series set for a spec: the spec name for the default reviewer, plus one slug-safe series per additional declared profile.
- Verify each expected series holds the phase's round, raising one issue per missing series-and-round, while a spec with no profiles verifies exactly as before.
- Keep `executing-spec`'s round-from-phase-rank mapping identical across every series.
- Add unit tests: no profiles, one extra profile, two extra profiles, a missing round in one series, and a series-name collision check.
- Keep the module pure and IO-free.

## Completion

- [ ] Review link accepts a series set and reports per-series misses
- [ ] Series naming is slug-safe and collision-free
- [ ] Tests green for all listed cases
- [ ] GATES.md passed
