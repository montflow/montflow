# Memory

## Context

Split `packages/specs/src/apps/cli/cli.apps.module.ts` (5,406 lines) into command-scoped modules. `cli.apps.module.ts` is now an 8-line barrel re-exporting the shared + command modules. Public exports and behavior unchanged; tests import through `src/apps/cli/index.ts`.

## Progress

- Split into `cli.shared.module.ts` (shared diagnostics + sizing loading), `cli.check.module.ts`, `cli.status.module.ts`, `cli.sizing.module.ts`, `cli.models.module.ts`, `cli.create.module.ts`, `cli.author.module.ts`, `cli.slash.module.ts`.
- All module files are under 1,000 lines (largest is `cli.slash.module.ts` at 913).
- Command modules import siblings only through `cli.apps.module.ts` (barrel) or `cli.shared.module.ts`.
- Added `tests/structure.test.ts` guarding file size and import rules.
- `main.ts`, root command, slash dispatch, and all tests keep working unchanged.

## Open Questions

- None.

## Handoff

- Gate commands below all pass.
- Smoke: `cli models --json --catalog fixtures/catalog.json` round-trips; `cli status --dir ../.. --name spec-optimizations` prints panel; `cli check --dir ../.. --verbose` runs (repo has pre-existing findings, exit 1).

## Deviations

- None.

## Gates

### Stage 0: Verification

- `bun run --cwd packages/specs test` → 96 test files, 1287 tests passed, no type errors.
- `bun run --cwd packages/specs lint:check` → passed (only module-type warnings).
- `bun run --cwd packages/specs format:check` → all matched files use correct format.
- `bun run --cwd packages/specs ts:check` → no errors.

### Stage 1: Behaviour

- `bun run --cwd packages/specs cli status --dir ../.. --name spec-optimizations` → prints status panel (exit 0).
- `bun run --cwd packages/specs cli models --json --catalog fixtures/catalog.json` → round-trips (exit 0).
- `bun run --cwd packages/specs cli check --dir ../.. --verbose` → runs; exits 1 due to pre-existing repo findings.
- No source file in `src/apps/cli` exceeds ~1,000 lines.