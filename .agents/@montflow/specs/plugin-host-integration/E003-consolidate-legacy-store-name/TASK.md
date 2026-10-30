---
id: E003
name: consolidate-legacy-store-name
type: execution
originator: user
depends-on: E002
related-tasks: C004, D001
status: complete
---

# Task E003: consolidate-legacy-store-name

## Type: execution

## Description

Remove the last Pi-era names from the live tree. Phase C retired user-facing
names only; phase E finishes the internal code and guards the result.

## Requirements

- See the phase description in SPEC.md and the task-specific notes in MEMORY.md.
- No user-visible behaviour change.
- Scoped tests and `bun run mf:check` pass.

## Completion

- [x] Change implemented.
- [x] Scoped checks pass.
