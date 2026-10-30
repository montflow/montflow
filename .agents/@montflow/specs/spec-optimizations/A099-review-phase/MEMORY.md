# Memory

## Context

Independent adversarial review of phase A (A001 contract, A002 surfacing,
A003 wire-authoring, A004 backfill), run as two isolated reviewer series:

- `.agents/@montflow/reviews/spec-optimizations/001/REVIEW.md` (general)
- `.agents/@montflow/reviews/spec-optimizations-effect-reviewer/001/REVIEW.md`
  (`effect-reviewer` profile, as declared in TASK.md)

## Progress

- Round 001 opened in both series with `mf-reviews create`, `- Phase: A`.
- General series: 9 findings (2 Major, 4 Minor, 3 Nit). All resolved.
- Effect series: 9 findings (3 Major, 2 Minor, 4 Nit). All resolved.
- Two fix rounds:
  - Round 1 (13 findings): dispatch-time size validation, `Cause` handling in
    every command (exit 2 for defects, stack only under `--verbose`), real
    `SyntaxError` causes, unreadable-config diagnostics, complete-task warning
    codes + layer trace, unknown-phase README alignment, coded `spec.not-found`,
    `--tasks` trailing-token default + fifth-token rejection, `check` summary
    unit counts, Effect `Match` style, single strict decode.
  - Round 2 (2 Nits): `cli.invalid-argument` for `list`/`create` argument
    errors, per-spec read-failure path (file once; spec directory once).
- Both series reached `Status: closed` with terminal verdict `pass`.

## Findings

- `task.missing-size` is now enforced at dispatch (`next`, `resolve`, `sizing`)
  as well as `check`; `next`/`status` exit codes agree.
- Unknown task sizes no longer drop a task from `status`/`next`; they report
  `task.unknown-size` with the task path.
- Malformed JSON preserves the real `JSON.parse` `SyntaxError` (message and
  position); unreadable files report `store.error` with the failing path and a
  preserved `EACCES` cause.
- `check --verbose` prints cause chains and layer traces; default output is
  unchanged.

## Open Questions

- Raw JSON syntax offset is preserved through `Effect.try`; the schema decoder
  is applied after, so no cause is lost.
- `execute` reusing `Which.resolve` remains C003's completion item.

## Handoff

- Phase A is locked in `SPEC.md`. Phase B starts with B003 (`skills-rename`),
  then B004 (`live-refs`), then B099 review.
- B003 must carry the prompt-store path rewrite inside skill bodies together
  with payload regeneration, plus the skill changelog entry B001 could not add.
- B003 must not reintroduce `pi-prompts`; B004 must not rewrite historical
  changelogs or completed spec records.

## Deviations

- The orchestrator fixed two one-line review findings directly (per-spec path
  helper, `CliError.UserError` arm) instead of dispatching a worker; the
  reviewer verified them as attempt 2 and closed both.
