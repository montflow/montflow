---
id: B003
name: decide-config-and-cli-surface
type: planning
originator: user
depends-on: A003
related-tasks:
status: pending
---

# Task B003: Decide config and CLI surface

## Type: planning

## Description

Decide plugin options, environment variables, and `/mf-telemetry` command surface
for maple integration.

## Requirements

- Define plugin options: endpoint, ingest key, region, service name override,
  autoStartMaple (default false), redaction flags.
- Define env var precedence (`MAPLE_ENDPOINT`, `MAPLE_INGEST_KEY`,
  `MAPLE_REGION`, `OTEL_EXPORTER_OTLP_ENDPOINT`).
- Define `/mf-telemetry` commands: `status`, `start`, `stop`, `restart`, plus
  existing delete/cleanup (if NDJSON retained).
- Decide maple binary discovery (`which maple` or configured path).

## Completion

- [ ] Config contract documented
- [ ] CLI command surface documented