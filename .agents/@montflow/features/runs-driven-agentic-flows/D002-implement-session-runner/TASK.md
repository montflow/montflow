---
id: D002
name: implement-session-runner
type: execution
originator: user
depends-on: D001
related-tasks:
status: complete
---

# Task D002: Replace the headless runner in the workspace

## Type: execution

## Description

Replace `apps/workspace/src/services/runs/` `runAgent` (spawn `pi -p`) with the
pi-runs engine per D001: dispatch a repo-local run, stream events into a
refreshable detail snapshot, expose `steer`, `answer`, `interrupt`, and settle
on completion. Update `CONTEXT.md`.

## Requirements

- Runs are always local; no mode argument.
- Steer while running, answer while parked.
- Interrupt kills cleanly and writes the cancelled receipt.
- Unit tests for event mapping and lifecycle transitions.

## Completion

- [ ] `runAgent` replaced for the profile-create path
- [ ] Tests pass (`bun run --cwd apps/workspace test`)
- [ ] Output summarized in MEMORY.md
