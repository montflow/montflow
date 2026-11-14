# Memory

## Context

Phase A inventories the verification and payload surfaces and lands two rails:
the issue severity channel and artifact-reference resolution. A001–A004 are
complete; A099 is the phase review.

## Progress

- 2026-11-03: closed review round `003` (the Phase A round) after fixing its
  three findings. `packages/prompts` and `packages/profiles` tests, lint,
  format, and typecheck pass; the round is `Status: closed` with all findings
  `Resolved`.

## Findings

- Round `003` F1: both skill resolvers now require `<name>/SKILL.md`, so an
  empty directory no longer resolves as installed. Evidence: the new tests in
  `packages/{prompts,profiles}/src/modules/skill-check/tests/skill-check.test.ts`.
- Round `003` F2: `--strict` now parses and threads through both slash `verify`
  surfaces, not only the binary. Evidence: parser tests in
  `packages/{prompts,profiles}/src/apps/cli/tests`.
- Round `003` F3: corrected the A004 memory claim about
  `SKILLS_ENGINE_WARNING` and the binary-only `--strict` handoff.

## Open Questions

- None.

## Handoff

- Phase A is complete and its review round is closed. The series ledger
  `.agents/@montflow/reviews/montflow-spec-standard/REVIEW.md` indexes round
  `003`.

## Deviations

- None.
