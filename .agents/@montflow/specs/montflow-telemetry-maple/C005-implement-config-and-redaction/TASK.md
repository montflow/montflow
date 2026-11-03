---
id: C005
name: implement-config-and-redaction
type: execution
originator: user
depends-on: B002
related-tasks: B002
status: pending
---

# Task C005: implement-config-and-redaction

## Type: execution

## Description

Implement plugin config and redaction options for maple export.

## Requirements

- Add options: endpoint, ingest key, region, service name override,
  autoStartMaple, captureBodies, captureDeltas.
- Env var precedence per B003.
- Preserve redaction hashing before export when captureBodies false.

## Completion

- [ ] Config implemented
- [ ] Redaction preserved