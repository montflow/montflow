---
id: G003
name: shared-json
type: execution
originator: user
size: small
depends-on: G001
related-tasks:
status: complete
---

# Task G003: shared-json

## Type: execution

## Description

Catalogue and sizing each carry their own JSON kind, record, and display helpers, and sizing verifies with a hand-written walker that duplicates its own schemas. The audit found `kindOf` copied verbatim.

Give both modules one fault vocabulary and keep the schemas authoritative.

## Requirements

- Move JSON-kind, record, and display helpers into one shared module consumed by catalogue and sizing; no duplicate `kindOf` or `isRecord` remains.
- Replace sizing hand-written entry, sizes, and phases verification with schema-backed decoding plus one fault-to-Issue mapping, or share the catalogue fault helper; every existing code, message, expected, actual, fix, and finding order is preserved.
- Add tests that exercise every sizing code and assert the exact diagnostic fields; catalogue tests stay green.
- No public export or CLI output changes.

## Completion

- [ ] One shared JSON helper module serves catalogue and sizing
- [ ] Sizing verification is schema-backed or shares the fault mapper
- [ ] Every sizing code renders the same diagnostic fields as before
- [ ] Public exports and CLI output are unchanged
