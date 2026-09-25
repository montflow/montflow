---
id: B009
name: test-session-port
type: execution
originator: defect:B007
depends-on: B007
related-tasks: B099
finding-ref: F10
status: complete
---

# Task B009: Cover the Pi session port and factory

## Type: execution

## Description

Review F10 (partial): `toPort`, `interactionTools`, and the factory `create`
have no tests because `toPort` is module-private. Extract/export the port
mapping behind a testable seam and cover listener dispatch, dispose, replay
seeding, and model resolution without a real Pi process.

## Requirements

- Testable seam for the Pi session port (export or inject).
- Tests for event dispatch, unsubscribe, dispose, replay seeding, tool wiring.
- No network/LLM in tests.
- Gates green.

## Completion

- [ ] F10 resolved with evidence
- [ ] Tests pass (`bun run --cwd packages/pi-runs test`)
- [ ] Output summarized in MEMORY.md
