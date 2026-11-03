---
id: C001
name: implement-otlp-exporter
type: execution
originator: user
depends-on: B001
related-tasks: B001
status: pending
---

# Task C001: implement-otlp-exporter

## Type: execution

## Description

Implement the OTLP export path in the plugin using the chosen transport.

## Requirements

- Replace or augment NDJSON append with OTLP span export to configured endpoint.
- Implement bounded in-memory buffer and backoff on failure.
- Ensure no network call blocks the session.
- Preserve best-effort, logged-once semantics.

## Completion

- [ ] OTLP export implemented
- [ ] Buffering/backoff implemented
- [ ] No session impact on failure