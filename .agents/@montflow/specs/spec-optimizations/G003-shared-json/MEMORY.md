# Memory

## Context

Shared the JSON helpers (kind, record, display) between catalogue and sizing, and
moved sizing verification to schema-backed decoding with a fault-to-Issue mapper.

## Progress

- done

## Files touched

- packages/specs/src/modules/json/json.module.ts
- packages/specs/src/modules/json/index.ts
- packages/specs/src/modules/shared-json/index.ts
- packages/specs/src/modules/shared-json/shared-json.module.ts
- packages/specs/src/modules/catalogue/catalogue.module.ts
- packages/specs/src/modules/sizing/sizing.module.ts

## Open Questions

- None.

## Handoff

- Shared module is `modules/json` (with a `shared-json` re-export shim for compatibility).
- Sizing verification now decodes with `RepoConfigSchema`/`SpecConfigSchema` and maps faults via `issueFromFault`; semantic checks (unknown phases, effort-without-model) remain as a small post-pass.
- All 1283 tests pass; catalogue tests unchanged.

## Deviations

- Added a `shared-json` directory shim re-exporting `json`, so both likely import paths resolve while keeping a single `kindOf`/`isRecord` definition.
- `invalidConfig` is effectively unreachable now because verification uses the same schemas, but retained for API compatibility.

## Gate output

### Stage 0

- `bun run --cwd packages/specs test`: 94 test files, 1283 tests passed, no type errors.
- `bun run --cwd packages/specs lint:check`: passed.
- `bun run --cwd packages/specs format:check`: passed.
- `bun run --cwd packages/specs ts:check`: passed.

### Stage 1

- `bun run --cwd packages/specs test -- src/modules/sizing/tests`: 8 files, 84 tests passed.
- `bun run --cwd packages/specs test -- src/modules/catalogue/tests`: 2 files, 42 tests passed.
- Malformed configs render the same codes, fields, expected/actual/fix, and order as before (verify-config suite green).