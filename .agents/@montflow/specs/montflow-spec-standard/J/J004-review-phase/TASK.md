---
id: J004
name: review-phase
type: review
originator: user
size: medium
depends-on: J002, J003, J001
write-scope: none
related-tasks: 
reviewer-profiles: 
status: complete
---

# Task J004: review-phase

## Type: review

## Description

Hostile review of the verification mode split: light skips repo gates and review without weakening task gates, lock and review decide correctly.

## Requirements

- Attack light mode for gap where repo gate is needed despite task gates passing.
- Confirm full mode still enforces review and repo gate, and audit line records model and mode.

## Execution

Follow the phase `MEMORY.md` `## Execution Brief`: read only this task, that brief, and the scoped source; run each gate once; keep this task's `MEMORY.md` under 80 lines; batch review findings into one fixer attempt.

## Completion

- [x] Done.
