---
id: G002
name: single-snapshot
type: execution
originator: user
size: small
depends-on: E003
related-tasks:
status: complete
---

# Task G002: single-snapshot

## Type: execution

## Description

`execute` calls `status` and then `next`, so one invocation snapshots every spec file, reads both configs, and verifies the tree twice. The two reads can also disagree if the tree changes between them.

Derive the ready set from the status read `execute` already performs.

## Requirements

- Extract a pure `nextOf(statusReport)` (or equivalent) that derives the ready set, active phase, and budget from an existing status report.
- `next` and `execute` consume that one derivation; `execute` performs one snapshot, one repo-config read, and one tree verification per invocation.
- A counting `SpecStore` test asserts the single read, and all existing status, next, and execute output and exit-code tests stay green.
- No behavior changes: ready-set order, budgets, blockers, and diagnostics are identical.

## Completion

- [ ] `execute` uses one status read for both state and ready set
- [ ] A counting store test proves one snapshot and one repo-config read
- [ ] All existing output and exit-code tests are unchanged
- [ ] Phase and budget derivation stays identical
