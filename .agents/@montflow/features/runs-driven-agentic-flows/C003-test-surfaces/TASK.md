---
id: C003
name: test-surfaces
type: execution
originator: user
depends-on: C002
related-tasks:
status: complete
---

# Task C003: Test the extension + CLI surfaces

## Type: execution

## Description

Cover both surfaces over the shared engine: command parsing, tool registration,
surface parity, and parity between extension and CLI behavior. Assert that the
manifest/`bin` wiring exposes the surfaces as documented.

## Requirements

- Extension registration test (commands/tools present).
- CLI parse/execute tests for each command in both modes.
- No duplicated engine logic asserted (surfaces delegate).

## Completion

- [ ] Tests pass (`bun run --cwd packages/pi-runs test`)
- [ ] Output summarized in MEMORY.md
