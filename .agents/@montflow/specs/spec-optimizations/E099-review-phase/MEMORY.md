# Memory

## Context

Phase E review task. Scope: independent adversarial review of phase E —
identifier validation at every surface (E001), the fresh-install skill gate
(E002), dispatch/check exit agreement plus catalogue verification counts (E003),
and the README truth pass (E004).

Reviewer profile: `effect-reviewer`, so the phase is backed by two series: the
spec's own series (general reviewer) and the `-effect-reviewer` series. Both
were run independently, in isolated subagent sessions that never saw the
workers' `MEMORY.md`.

## Progress

- Read the derived state and the ready set for phase E (E001, E002).
- Dispatched E001 and E002 concurrently, each as `spec-worker`; both returned
  `done` with receipts.
- Re-ran every `GATES.md` command in both tasks myself; all pass, with the
  `--dir .` cwd artifact recorded per task.
- Marked E001 and E002 complete in `TASK.md` and the `SPEC.md` table.
- Dispatched E003 (after E001), then E004 (after E001 + E003); re-ran all gates
  and marked both complete.
- Ran the phase review as two independent isolated series, rounds 005-007, with
  a fixer pass between each round. Both series closed: the effect-reviewer
  series on a terminal `pass`; the general series on the user's cap decision.
- Recorded the verdict, completed E099 in `TASK.md` and `SPEC.md`, appended `E`
  to `locked-phases`, and confirmed with `mf-specs check` and `mf-specs state`.

## Review series and rounds

Budget for phase E: 3 (largest task size `medium`). One cycle = one round in
every series.

| Series | Round | Type | Verdict | Outcome |
| --- | --- | --- | --- | --- |
| `.agents/@montflow/reviews/spec-optimizations` | 005 | re-review | pass | 4 findings (F31-F34), fixer resolved, re-reviewed |
| `.agents/@montflow/reviews/spec-optimizations-effect-reviewer` | 005 | re-review | pass | 9 findings (F46-F54), fixer resolved, re-reviewed |
| `.agents/@montflow/reviews/spec-optimizations` | 006 | re-review | rework | F31-F34 resolved; F35-F38 open |
| `.agents/@montflow/reviews/spec-optimizations-effect-reviewer` | 006 | re-review | rework | F46-F51/F53-F54 resolved; F52, F55-F58 open |
| `.agents/@montflow/reviews/spec-optimizations` | 007 | re-review | rework | F35, F36, F38 resolved; F37 (Nit) + F39 (Nit) open |
| `.agents/@montflow/reviews/spec-optimizations-effect-reviewer` | 007 | re-review | pass | all 5 resolved, 0 new, series closed |

All rounds carry `- Phase: E` in `## Metadata`. Round numbers are global to the
spec; rounds 001-004 covered phases A-D.

## Cap escalation and user decision

Round 007 was phase E's third and last cycle. The general series returned
`rework` over two Nits — F37 (`resolve` refusals named the `sizing` command in
`next`) and F39 (a `models --verify` refusal's `next` row dropped
`--catalog`/`--provider` and failed when run). Both were fixed with
fails-without-the-fix tests before the decision was requested.

The user was asked whether to spend a round past the cap. Decision: an extra
round only for serious findings, not Nits or Minors. F37 and F39 are Nits with
fix evidence and green gates, so both were accepted for the lock without a
round 008. Each finding carries a `[Human]` turn in
`2026-10-28`'s cap-decision record in
`.agents/@montflow/reviews/spec-optimizations/007/REVIEW.md`.

The effect-reviewer series reached a clean terminal `pass` on its own third
round with zero open findings, so phase E's review gate is satisfied.

## Gate

`bun run mf:gate` (E099's own gate) — exit 0:

```text
46 skills · 0 issues
5 prompts · 0 issues · 0 warnings
8 specs · 0 failed · 0 issues · 91 warnings
12 profiles · 0 issues · 0 warnings
16 files · 0 issues
✓ spec skills and prompts are installed and up to date.
✓ review skills are installed and up to date.
```

Package gates at lock time, all exit 0:

```text
$ bun run --cwd packages/specs test
 Test Files  92 passed (92)
      Tests  1165 passed (1165)
Type Errors  no errors
$ bun run --cwd packages/specs lint:check
$ oxlint --deny-warnings .
$ bun run --cwd packages/specs format:check
All matched files use the correct format.
$ bun run --cwd packages/specs ts:check
$ tsc --noEmit
```

## Verdict

`pass`. Phase E locked.

What now works that did not before: every CLI, slash, and host surface refuses a
malformed spec name or phase with `cli.invalid-argument` before any store read;
`next` exits 1 exactly when tree verification errors; `models --verify` always
states entries checked and skipped, split by layer and provider; a fresh
doctor-only workspace renders all three shipped prompts with only advisories for
non-owned skills; the README sizing transcript runs outside the host.

## Open Questions

- None blocking. Two observations were filed by reviewers as out of scope and
  remain for phase F/G: `models` listing treats a supplied blank `--name` as
  absent, and `dispatchErrorText`'s doc comment mentions a layer trace only
  `check` can supply.

## Handoff

- Phase F (F001 warning-grouping, F002 record-checks, F003 surface-nits) starts
  from a green tree; `src/modules/diagnostic/` is now the single diagnostic
  renderer, and `GUARD_RERUN` is the single table of per-surface re-run rows.
- The two accepted Nits (F37, F39) are recorded with their fixer evidence in
  round 007; a regression would surface in `validate-names.test.ts` and
  `models.test.ts`.

## Deviations

- Locked phase E with F37/F39 at `In Review` rather than reviewer-`Resolved`,
  on an explicit user cap decision. The status is left `In Review` in the round
  file rather than rewritten to `Resolved`, so the record keeps saying who
  verified what.
