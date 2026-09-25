---
id: C002
name: implement-cli-surface
type: execution
originator: user
depends-on: C001
related-tasks:
status: complete
---

# Task C002: Implement the runs CLI

## Type: execution

## Description

Add a CLI over the B002 engine (`packages/pi-runs/src/apps/cli/`), mirroring
`@montflow/pi-profiles`' `mf-profiles-cli` and `pi-features`' CLI. Expose
start/status/steer/answer/list and the mode flag. Add the `bin` entry (and the
repo-root devDependency link if needed, like `mf-features`).

## Requirements

- Commands cover the A004 surface; `start/list/steer/answer/status` verbs.
- Non-interactive; missing input fails with usage, never prompts.
- `bin` resolves inside the repo; known flags validated.
- CLI tests pass.

## Completion

- [ ] CLI runs against the engine both modes
- [ ] Tests pass (`bun run --cwd packages/pi-runs test`)
- [ ] Output summarized in MEMORY.md
