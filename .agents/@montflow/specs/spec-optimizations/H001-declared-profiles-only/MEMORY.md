# Memory

## Context

Task H001 declared-profiles-only. Scope: packages/specs authoring artifacts, validation message, tests, README, embedded payload.

## Progress

- Replaced reviewer-profiles rule in `packages/specs/skills/montflow-create-specs/SKILL.md` step 4 (dropped task-type predicate and `effect-reviewer` example; added discovery-and-judgment rule + per-profile round cost).
- Rewrote §5 of `packages/specs/prompts/spec-create.json` with same rule plus `--reviewer-profiles` seeds only the one phase's review task.
- Replaced `effect-reviewer` example in validation message in `packages/specs/src/apps/cli/cli.create.module.ts` with `example-reviewer`.
- Swept six package tests to `example-reviewer` fixture.
- Added sentence to README multi-reviewer section.
- Regenerated `embedded-payload.generated.ts`; ran `mf-specs doctor`.
- All gates green.

## Open Questions

- None.

## Handoff

- `packages/specs` tests, lint, format, typecheck pass.
- `mf:check:skills`, `mf:check:prompts`, `mf:check:specs` pass.
- `bun run --cwd packages/specs cli doctor --check` reports all current.

## Deviations

- None.

## Gate Output

### `bun run --cwd packages/specs test`
```
Test Files  96 passed (96)
Tests  1299 passed (1299)
Type Errors  no errors
```

### `bun run --cwd packages/specs lint:check`
```
oxlint --deny-warnings .  (exit 0)
```

### `bun run --cwd packages/specs format:check`
```
All matched files use the correct format.
```

### `bun run --cwd packages/specs ts:check`
```
tsc --noEmit (exit 0)
```

### `bun run --cwd packages/specs cli doctor --check`
```
✓ spec skills and prompts are installed and up to date.
```

### `bun run mf:check:skills`
```
46 skills · 0 issues
✓ skills are installed and up to date.
```

### `bun run mf:check:prompts`
```
5 prompts · 0 issues · 0 warnings
✓ prompts skills are installed and up to date.
```

### `bun run mf:check:specs`
```
8 specs · 0 failed · 0 issues · 241 warnings
✓ spec skills and prompts are installed and up to date.
```
