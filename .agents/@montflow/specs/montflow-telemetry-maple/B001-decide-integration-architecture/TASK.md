---
id: B001
name: decide-integration-architecture
type: planning
originator: user
depends-on: A004
related-tasks:
status: pending
---

# Task B001: Decide the integration architecture

## Type: planning

## Description

Decide how montflow telemetry integrates with maple: transport, SDK choice,
hosted vs local default, and whether NDJSON is retained as fallback.

## Requirements

- Decide transport: reuse `@maple-dev/effect-sdk`, hand-roll OTLP/JSON, or use
  `@opentelemetry/sdk-trace-base`. Record rationale and dependency cost.
- Decide default endpoint policy: hosted requires opt-in ingest key; local
  `http://127.0.0.1:4318` when `maple start` is reachable; offline fallback.
- Decide whether NDJSON + SQLite fold remain as offline fallback or are removed.
- Decide buffering/backoff when maple is unreachable (bounded in-memory queue).
- Record rejected alternatives.

## Completion

- [ ] Architecture decision recorded with transport and fallback policy
- [ ] Dependency and offline behavior documented
