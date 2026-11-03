---
id: C003
name: implement-maple-lifecycle-and-refcount
type: execution
originator: user
depends-on: B003
related-tasks: B003
status: pending
---

# Task C003: implement-maple-lifecycle-and-refcount

## Type: execution

## Description

Implement async maple start/stop with refcount across OpenCode instances.

## Requirements

- Implement refcount file with flock guarding.
- Spawn `maple start --background` when count becomes 1 and not running.
- Decrement on cleanup; stop maple when count reaches 0 and this instance is starter.
- Register process exit hooks.

## Completion

- [ ] Refcount implemented
- [ ] Async start/stop working
- [ ] Exit hooks registered