# GATES

## Stage 0: Verb contract

- [ ] `mf-specs review decide --name montflow-spec-standard --phase C --mode guided` exits 0 and prints `decision`, `rounds`, `open`, `reason` for a fixture with no round (`start`)
- [ ] `--json` returns the same decision and fields, including the per-series breakdown
- [ ] An invalid `--phase`/`--mode` exits 2; the verb writes nothing (fixture content and mtimes unchanged)

## Stage 1: Matrix

- [ ] A table test covers `waived`, `start`, `phase-unattributed`, `clean`, `minor-only`, `budget-remaining`, `escalate-cap`, `overflow-eligible`, and `overflow-exhausted`
- [ ] Budgets 1, 2, and 3 each pick the expected row
- [ ] Two series (spec + profile) produce the strictest decision, and the per-series breakdown names each
- [ ] An unparsable severity returns `escalate` with `review.severity-unparsable`

## Stage 2: Closure and overflow

- [ ] A round with only Minor/Nit open closes as `- Disposition: minor-deferred` and counts as passing
- [ ] A `minor-deferred` round with an open Critical/Major is `review.deferred-severity` and does not pass
- [ ] Autonomous: one `- Overflow-authorized: autonomous` round is accepted past the budget; a second is `review.overflow-exhausted`
- [ ] Guided: `review decide` returns `escalate` at the cap, and a `- Overflow-authorized: user` round is accepted past the budget
- [ ] `structure` and `next` stop hard-erroring the authorized round and still error an unauthorized one

## Stage 3: Surfaces

- [ ] `packages/specs/prompts/spec-execute.json` and the installed `spec-execution-orchestrator` profile call `review decide` before a fixer or another reviewer
- [ ] The installed `montflow-adversarial-review` skill documents `minor-deferred` and the overflow metadata
- [ ] `bun run mf-specs:doctor --check` and `bun run mf-reviews:doctor --check` report the shipped payloads current (use the `mf-*:check` scripts instead if doctor verbs differ)

## Stage 4: Verification

- [ ] `bun run --cwd packages/specs test -- --run` passes
- [ ] `bun run --cwd packages/reviews test` passes
- [ ] `bun run mf-specs:check` passes with zero issues
- [ ] `bun run mf-reviews:check` passes with zero issues
- [ ] `bun run ts:check`, `bun run lint:check`, and `bun run fmt:check` pass
