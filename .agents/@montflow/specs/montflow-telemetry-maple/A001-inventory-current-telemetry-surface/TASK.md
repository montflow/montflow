---
id: A001
name: inventory-current-telemetry-surface
type: exploratory
originator: user
depends-on: 
related-tasks:
status: pending
---

# Task A001: inventory-current-telemetry-surface

## Type: exploratory

## Description

Inventory the current telemetry package surface: capture, store, fold, viewer,
purge, and plugin entry, to know what gets replaced or retained.

## Requirements

- List modules in packages/telemetry/src and their responsibilities.
- Identify data flow: events -> NDJSON -> fold -> SQLite -> viewer.
- Identify privacy/redaction points and capture flags.
- Identify public exports and CLI commands that must be preserved or removed.

## Completion

- [ ] Done.
