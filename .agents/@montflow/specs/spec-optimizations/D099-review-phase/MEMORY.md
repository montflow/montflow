# Memory

## Context

Phase D review (`D099`) closed the last task of `spec-optimizations`. Phases
A, B, and C are locked and passed both reviewer series. All execution tasks
D001–D004 are complete; review round `004` closed in both series with every
finding resolved.

## Progress

- Phase A: locked. Review series `spec-optimizations` and
  `spec-optimizations-effect-reviewer` round `001` closed, `pass`.
- Phase B: locked. Round `002` closed, `pass`.
- Phase C: locked. Round `003` closed, `pass`.
- Phase D: D001–D004 complete. Review round `004` closed `pass` in both series
  after a fix → re-review loop: `.agents/@montflow/reviews/spec-optimizations/004/REVIEW.md`
  (F22–F30, 9 Resolved) and
  `.agents/@montflow/reviews/spec-optimizations-effect-reviewer/004/REVIEW.md`
  (F36–F45, 10 Resolved).
- D099 complete; phase D locked; spec complete.

## Findings

Round `004` closed with every finding `Resolved` in both series. The blocking
pair and what closed them:

- `F22` — solved by widening the sizing grammar (user decision): the first `/`
  separates provider from model, the model part may carry further `/` and `:`,
  and effort tokens are case-insensitive; catalogue membership stays the
  authoritative check. The catalogue boundary now exposes only storable targets
  (`default` included) and refuses unstorable `--catalog` input as
  `models.malformed-catalog`. Attempt 2 closed two post-pass defects the
  reviewers reported: a `MODEL_HINT` prose leak inside quoted `fix` strings and
  the boundary emitting unstorable ids/variants.
- `F36` — `models --verify` now fails on a missing root and answers
  `spec.not-found` for an unknown `--name`, matching every other surface.
- `F44`/`F45` — the `default` label joined the storable rule, and id refusals
  name the rule they actually break (`Set …` for a blank key, `Add …` only when
  absent).

## Open Questions

- Resolved: the model-id grammar was widened rather than normalised at the
  boundary, because OpenRouter namespaces and Ollama tags are normal host
  shapes and slugifying would invent an id the host does not have.
- Resolved: `sizing-config` accepts unknown spec/phase ids by design (D003);
  no reviewer objected.

## Handoff

Phase D is locked and the spec is complete. Nothing is pending.

## Verification

- `bun run --cwd packages/specs cli check --name spec-optimizations` →
  `1 spec · 0 failed · 0 issues`.
- `bun run --cwd packages/specs cli state --name spec-optimizations` →
  `complete · state complete · phase none · locked A,B,C,D`.
- `bun run mf:gate` → exit 0: turbo `lint:check` / `format:check` / `ts:check` /
  `test` / `test:tui` / `smoke` (13 tasks each), then `mf:check` scopes:
  `46 skills · 0 issues`, `5 prompts · 0 issues`, `6 specs · 0 failed · 0 issues`
  (79 historical `task.missing-size` warnings), `12 profiles · 0 issues`,
  `10 files · 0 issues`.
- Package-level evidence for the round-004 fixes: `@montflow/specs` 84 files /
  1039 tests, `ts:check` clean, `lint:check` and `format:check` clean.

## Deviations

- The orchestrator fixed two one-line review findings directly in earlier
  phases; round 004 went through fixer workers.
- Round 004 took two fixer re-engagements after both reviewers closed it `pass`:
  the fixer's own `MODEL_HINT` widening and the still-lenient catalogue boundary
  were reported as post-pass defects, so F22/F40 were reopened at attempt 2 and
  the effect series filed `F44`/`F45`. All closed `Resolved`.

