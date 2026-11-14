---
id: J002
name: implement-verification-schema
type: execution
originator: user
size: small
depends-on: J001
write-scope: packages/specs
related-tasks: J003, J004
status: complete
---

# Task J002: implement-verification-schema

## Type: execution

## Description

Extend sizing.json with a verification field per size entry with light default, wire resolve and status surfaces, and keep mechanical task gates for light mode.

## Requirements

- sizing.json accepts verification light or full on every size entry, defaults absent entries to light, and inherits whole entries per layer merge.
- mf-specs resolve and sizing show the mode with the dispatch target, status and next show it per ready line.
- Light mode keeps task-local mechanical gates proven; only repo-wide and review are skipped.

## Execution

Follow the phase `MEMORY.md` `## Execution Brief`: read only this task, that brief, and the scoped source; run each gate once; keep this task's `MEMORY.md` under 80 lines; batch review findings into one fixer attempt.

## Completion

- [x] Done.
