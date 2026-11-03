---
id: B002
name: decide-data-mapping-and-redaction
type: planning
originator: user
depends-on: A002
related-tasks:
status: pending
---

# Task B002: Decide data mapping and redaction

## Type: planning

## Description

Decide how OpenCode events map to OTLP spans and how body redaction is preserved.

## Requirements

- Define the event-to-span mapping table (execution, step, tool, compaction,
  permission, usage).
- Decide gen_ai.* keys emitted for model/token/cost so maple facts populate
  `maple_ai.llm_call` and `maple_ai.usage.*`.
- Decide redaction strategy: hash bodies before export vs. rely on maple; keep
  `captureBodies`/`captureDeltas` semantics.
- Decide session id propagation (`maple_ai.session.id`, `maple_ai.turn.id`).

## Completion

- [ ] Mapping table recorded
- [ ] Redaction and capture-flag semantics documented