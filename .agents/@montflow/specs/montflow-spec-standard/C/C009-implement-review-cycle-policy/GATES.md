# GATES

## Stage 0: Verb contract

- [x] `mf-specs review decide --name montflow-spec-standard --phase C --mode guided` exits 0 and prints `decision`, `rounds`, `open`, `reason` for a fixture with no round (`start`)
- [x] `--json` returns the same decision and fields, including the per-series breakdown
- [x] An invalid `--phase`/`--mode` exits 2; the verb writes nothing (fixture content and mtimes unchanged)

## Stage 1: Matrix

- [x] A table test covers `waived`, `start`, `phase-unattributed`, `clean`, `minor-only`, `budget-remaining`, `escalate-cap`, `overflow-eligible`, and `overflow-exhausted`
- [x] Budgets 1, 2, and 3 each pick the expected row
- [x] Two series (spec + profile) produce the strictest decision, and the per-series breakdown names each
- [x] An unparsable severity returns `escalate` with `review.severity-unparsable`

## Stage 2: Closure and overflow

- [x] A round with only Minor/Nit open closes as `- Disposition: minor-deferred` and counts as passing
- [x] A `minor-deferred` round with an open Critical/Major is `review.deferred-severity` and does not pass
- [x] Autonomous: one `- Overflow-authorized: autonomous` round is accepted past the budget; a second is `review.overflow-exhausted`
- [x] Guided: `review decide` returns `escalate` at the cap, and a `- Overflow-authorized: user` round is accepted past the budget
- [x] `structure` and `next` stop hard-erroring the authorized round and still error an unauthorized one

## Stage 3: Surfaces

- [x] `packages/specs/prompts/spec-execute.json` and the installed `spec-execution-orchestrator` profile call `review decide` before a fixer or another reviewer
- [x] The installed `montflow-adversarial-review` skill documents `minor-deferred` and the overflow metadata
- [x] `bun run mf-specs:doctor --check` and `bun run mf-reviews:doctor --check` report the shipped payloads current (use the `mf-*:check` scripts instead if doctor verbs differ)

## Stage 4: Verification

- [x] `bun run --cwd packages/specs test -- --run` passes
- [x] `bun run --cwd packages/reviews test` passes
- [x] `bun run mf-specs:check` passes with zero issues
- [x] `bun run mf-reviews:check` passes with zero issues
- [x] `bun run ts:check`, `bun run lint:check`, and `bun run fmt:check` pass
