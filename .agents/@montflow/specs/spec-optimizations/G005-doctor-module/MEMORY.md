# Memory

## Context

Moved the doctor engine from `packages/specs/src/apps/doctor` to
`packages/specs/src/modules/doctor` so `src/modules/**` no longer imports
`src/apps/**`. Updated all imports, tests, the embedded-payload generator, and
added a module-import direction guard test.

## Progress

- done

## Files touched

- `packages/specs/src/modules/doctor/*` (moved from `apps/doctor`, renamed
  `doctor.apps.module.ts` -> `doctor.module.ts`)
- `packages/specs/src/modules/index.ts` (export Doctor)
- `packages/specs/src/modules/prompt/prompt.module.ts`
- `packages/specs/src/modules/prompt/tests/*.ts`
- `packages/specs/src/apps/cli/cli.apps.module.ts`
- `packages/specs/src/apps/cli/tests/*.ts`
- `packages/specs/src/apps/server/tests/spec-tools.test.ts`
- `packages/specs/src/apps/index.ts`
- `packages/specs/scripts/generate-embedded-payload.ts`
- `packages/specs/src/modules/doctor/tests/import-direction.test.ts` (new)
- `packages/specs/README.md`, CONTEXT.md references

## Gates

- `bun run --cwd packages/specs ts:check` — pass (no errors)
- `bun run --cwd packages/specs test` — pass (94 test files, 1283 tests)
- `bun run --cwd packages/specs lint:check` — pass
- `bun run --cwd packages/specs format:check` — pass
- `bun run --cwd packages/specs generate:payload` — pass
- `bun run mf:check:specs` — pass (8 specs, 0 issues)
- `bun run mf:check` — fails only on pre-existing
  `.agents/@montflow/reviews/spec-optimizations/010/REVIEW.md` missing
  `## Summary` heading (unrelated to this task)

## Open Questions

- None.

## Handoff

- The import-direction test at
  `packages/specs/src/modules/doctor/tests/import-direction.test.ts` scans all
  files under `src/modules` and fails if any import references `src/apps`.
- Prompt loading, doctor payload, and embedded-payload generation behave as
  before; verified by full specs test suite and `mf:check:specs`.

## Deviations

- None in code. Gate command `cli ... --dir .` in GATES assumes a repo root;
  run with the repository root (as `mf:check:specs` does) for payloads to
  resolve.