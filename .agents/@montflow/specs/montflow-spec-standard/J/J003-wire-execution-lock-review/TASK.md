---
id: J003
name: wire-execution-lock-review
type: execution
originator: user
size: small
depends-on: J002
write-scope: packages/specs
related-tasks: J004
status: complete
---

# Task J003: wire-execution-lock-review

## Type: execution

## Description

Gate execution, lock derivation, and review policy on the verification mode from J002, with audit logging in task memory.

## Requirements

- Execution loop runs task gate only for light, task plus phase plus repo-wide for full, and records verification light with model id in task memory.
- Lock derivation treats light with proven task gates as lockable without review, same path as waived; full requires closed review round.
- Review decide returns waived for light and normal decision for full; no hand-counting persists.

## Execution

Follow the phase `MEMORY.md` `## Execution Brief`: read only this task, that brief, and the scoped source; run each gate once; keep this task's `MEMORY.md` under 80 lines; batch review findings into one fixer attempt.

## Completion

- [x] Done.
