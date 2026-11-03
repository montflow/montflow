---
id: A004
name: explore-lifecycle-and-refcount
type: exploratory
originator: user
depends-on: A003
related-tasks: A003
status: pending
---

# Task A004: explore-lifecycle-and-refcount

## Type: exploratory

## Description

Explore maple lifecycle coordination: async start, refcount across OpenCode
instances, and graceful shutdown.

## Requirements

- Verify `maple start --background` and `maple stop` behavior.
- Design refcount file and ownership tracking.
- Design process exit hooks for cleanup.
- Assess port collision and crash recovery.

## Completion

- [ ] Done.
