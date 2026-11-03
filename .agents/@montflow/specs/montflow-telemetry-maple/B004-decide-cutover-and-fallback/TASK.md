---
id: B004
name: decide-cutover-and-fallback
type: planning
originator: user
depends-on: B001
related-tasks:
status: pending
---

# Task B004: Decide cutover and fallback

## Type: planning

## Description

Decide rollout strategy: feature flag, parallel run, and removal of the old
viewer.

## Requirements

- Decide whether maple export is opt-in behind a flag for one release.
- Decide when to remove NDJSON store, fold, and bespoke viewer.
- Define verification/acceptance criteria for parity with current viewer.
- Define rollback plan.

## Completion

- [ ] Cutover plan recorded
- [ ] Rollback and acceptance criteria documented