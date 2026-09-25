---
id: B004
name: test-run-engine
type: execution
originator: user
depends-on: B003
related-tasks:
status: complete
---

# Task B004: Harden the run engine tests

## Type: execution

## Description

Cover the engine end to end at the unit/integration level: full lifecycle,
steering during running, park/answer, interruption, settle-once, own-store
integrity, cross-machine resume/replay, verification failure classes, and the
completion + notification hooks. Use `@effect/vitest` and a stub Pi session
where a real process is impractical.

## Requirements

- Resume/replay round-trip covered (start → commit-shaped snapshot → resume).
- Verify failure classes covered; invalid runs refuse to resume.
- Failure and interrupt paths covered.
- No network/LLM dependency in tests.

## Completion

- [ ] Tests pass (`bun run --cwd packages/pi-runs test`)
- [ ] Output summarized in MEMORY.md
