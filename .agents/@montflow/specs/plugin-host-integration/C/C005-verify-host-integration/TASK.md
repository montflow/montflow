---
id: C005
name: verify-host-integration
type: execution
originator: user
depends-on: C004
related-tasks: C001, C002, C003, C004
status: in-progress
---

# Task C005: verify-host-integration

## Type: execution

## Description

Prove the integration mechanically and by hand. A plugin that loads in a unit
test but throws in the host is exactly the failure this spec started from, so the
verification has to exercise the real loader and a real session.

## Requirements

- Add a check that resolves and imports every plugin package through the host
  loader path, failing when any entry cannot be imported. It runs in CI and as
  part of the repo gate.
- Run `bun run mf:gate` and record the result.
- In a real host session, confirm each command and picker: `/mf-prompts list`
  replies, and `/prompts` plus the four new pickers list their store and insert
  the expected text.
- Record the host version used for the manual pass, so a later failure can be
  attributed to a host change.
- Document the dev override (`.opencode/plugins/` or `plugins` config) needed to
  load local packages, and when it should be removed.

## Completion

- [ ] Loader check added and wired into the gate.
- [ ] `mf:gate` green.
- [ ] Manual pass recorded with host version.
