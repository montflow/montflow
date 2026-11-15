# Memory

## Context

Review phase A end to end: the shared `construct` engine stays model-free and
reuses shared validation, the wizard collects type-matched inputs with profiles
and recommended-fallback, the binary/slash expose only `construct`, and the two
legacy commands are gone. Verify each task gate and confirm package verification
is green.

## Progress

- complete

## Findings

- A001 `construct` engine: model-free, no doctor gate, applies defaults, refuses
  missing/invalid inputs with the shared wording; verified via its unit tests.
- A002 `constructWizard`: prompt picker, type-matched controls, profile-backed
  select (via `@montflow/profiles` `ProfileStore`), recommended-fallback, back/
  cancel printing nothing, non-TTY refusal; verified via its wizard tests.
- A003 binary/slash: only `construct` (plus `--wizard`/`--copy`) exposed;
  `render`/`execute` removed from the binary, slash command, and (in this round)
  the interactive menu; CLI tests describe the single operation.
- CLI and `/mf-prompts` share rendering/validation via `PromptExecute.construct`
  and `Prompts.isVisible`/`resolveInputs`; no duplicated validation.
- `mf-specs check` reports zero issues; all task gates (A001/A002/A003) recorded.
- Package verification (`packages/prompts`): test, lint, format, typecheck all
  green (779 tests).

## Gates

- A001/A002/A003 task gates recorded once each; A001 re-ran after a format
  fingerprint drift. `mf-specs check` clean.

## Open Questions

- None.

## Handoff

- Review series `prompts-construct-wizard`: round 001, 1 Major + 3 Minor
  findings, all Resolved (F1 interactive-menu verbs removed, F2 double profile
  read, F3 blank-answer forward-skip, F4 readline close). `mf-reviews verify`
  clean; `mf-specs review decide` → `waived` (verification.light, open 0).

## Deviations

- Review was performed in the implementing session (orchestrator has no subagent
  tool to spawn an isolated reviewer); the round records `Isolation:
  non-isolated`.