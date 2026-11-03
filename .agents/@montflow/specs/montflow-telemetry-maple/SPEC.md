---
name: montflow-telemetry-maple
status: in-progress
workspace-type: in-place
author: Daniel Montilla
created: 2026-11-03
locked-phases:
---

# montflow-telemetry-maple

## Description

Migrate telemetry from a bespoke NDJSON store + SQLite fold + custom trace
waterfall viewer to maple.dev as the OTLP backend, while preserving in-process
capture and privacy redaction.

## Requirements

- Collection stays in-process; no network call unless maple export is enabled.
- Maple is treated as an external dependency: the plugin never auto-starts it
  unless `autoStartMaple` is explicitly enabled.
- OTLP resource attributes carry the repository as `service.name` for filtering.
- Redaction/body hashing semantics are preserved.
- Offline fallback (NDJSON) is decided in phase B.

## Tasks

| ID | Name | Type | Status | Gates |
| --- | --- | --- | --- | --- |
| A001 | inventory-current-telemetry-surface | exploratory | pending | No |
| A002 | explore-maple-ingest-and-agent-sessions | exploratory | pending | No |
| A003 | explore-otlp-export-options | exploratory | pending | No |
| A004 | explore-lifecycle-and-refcount | exploratory | pending | No |
| A099 | review-phase | review | pending | No |
| B001 | decide-integration-architecture | planning | pending | No |
| B002 | decide-data-mapping-and-redaction | planning | pending | No |
| B003 | decide-config-and-cli-surface | planning | pending | No |
| B004 | decide-cutover-and-fallback | planning | pending | No |
| B099 | review-phase | review | pending | No |
| C001 | implement-otlp-exporter | execution | pending | Yes |
| C002 | implement-resource-attributes-and-mapping | execution | pending | Yes |
| C003 | implement-maple-lifecycle-and-refcount | execution | pending | Yes |
| C004 | implement-cli-status-start-stop | execution | pending | Yes |
| C005 | implement-config-and-redaction | execution | pending | Yes |
| C006 | tests-and-verification | execution | pending | Yes |
| C099 | review-phase | review | pending | No |