# Memory

## Context

Implemented catalogue omission tracking and `check --catalog`.

## Progress

- done

## Files touched

- packages/specs/src/modules/catalogue/catalogue.module.ts
- packages/specs/src/modules/catalogue/tests/catalogue.test.ts
- packages/specs/src/apps/cli/cli.apps.module.ts

## Verification

- `bun run --cwd packages/specs test`: 94 files, 1283 tests passed.
- `bun run --cwd packages/specs lint:check`: passed.
- `bun run --cwd packages/specs format:check`: passed.
- `bun run --cwd packages/specs ts:check`: passed.
- `bun run --cwd packages/specs cli models --catalog fixtures/catalog.json`: printed table with `omitted: 0 models, 0 variants, 0 defaults`.
- `bun run --cwd packages/specs cli check --dir fixtures --catalog fixtures/catalog.json --name mock-ok`: exited 1.
- `bun run --cwd packages/specs cli check --dir <repo> --name spec-optimizations`: exited 0.

## Open Questions

- Exact hidden-test expectations for omitted-count field naming and table footer wording may differ; implementation uses `omitted: { models, variants, defaults }` and footer `omitted: N models, N variants, N defaults`.

## Handoff

- check --catalog cross-checks repo and spec configs; malformed catalogue surfaces as `models.malformed-catalog`.

## Deviations

- None.
