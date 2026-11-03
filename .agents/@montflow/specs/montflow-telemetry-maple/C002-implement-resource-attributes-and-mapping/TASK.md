---
id: C002
name: implement-resource-attributes-and-mapping
type: execution
originator: user
depends-on: B002
related-tasks: B002
status: pending
---

# Task C002: implement-resource-attributes-and-mapping

## Type: execution

## Description

Implement event-to-span mapping and OTLP resource attributes (service.name = repo).

## Requirements

- Map OpenCode events to spans per B002 mapping table.
- Emit gen_ai.* keys for model/token/cost.
- Set maple_ai.session.id and maple_ai.turn.id.
- Set service.name, service.namespace, vcs.repository.url.full.

## Completion

- [ ] Mapping implemented
- [ ] Resource attributes implemented
- [ ] Spans visible in maple Agent Sessions