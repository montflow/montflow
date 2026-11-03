---
id: A002
name: explore-maple-ingest-and-agent-sessions
type: exploratory
originator: user
depends-on: A001
related-tasks: A001
status: pending
---

# Task A002: explore-maple-ingest-and-agent-sessions

## Type: exploratory

## Description

Explore maple ingest and Agent Sessions: how traces are classified, what span
attributes are required, and how a session renders.

## Requirements

- Read apps/ingest/src/ai_session.rs and claude_code.rs for vendor detection.
- Determine minimal span attributes for a span to appear in Agent Sessions.
- Confirm local maple start and OTLP endpoint behavior.
- Document maple's data model (traces/logs/metrics) relevant to us.

## Completion

- [ ] Done.
