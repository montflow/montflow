---
id: A099
name: review-phase
type: review
originator: user
size: small
depends-on:
related-tasks:
reviewer-profiles: effect-reviewer
status: complete
---

# Task A099: Review phase

## Type: review

## Description

Run an independent adversarial review over phase A: the sizing contract, its
verification, the CLI surfacing, the authoring/dispatch wiring, and the
backfill.

## Requirements

- Check that `tiny`, `small`, `medium`, `large` have one source of truth and that
  every consumer reads it.
- Attack config verification and merge precedence: malformed JSON, unknown keys,
  effort without a model, whole-entry replacement, repo -> spec -> phase, and
  inherit fallback.
- Verify task-size enforcement: missing on pending/in-progress/blocked is an
  error, missing on complete is a warning, unknown is an error, and the table
  stays unchanged.
- Verify `status`, `next`, `resolve`, and `sizing` report the effective target
  and source, `resolve` emits nothing extra on stdout, and `sizing --human`
  shows every layer for all four sizes.
- Attack the error UX: malformed JSON, unknown keys, missing model, effort
  without a model, unknown task, and an injected defect. Every case must carry a
  stable code, path, field, fix, and preserved cause, with no raw stack by
  default and no swallowed `Cause`.
- Verify the authoring skill copies are byte-identical, the prompts/profiles
  state the `inherit` dispatch rule, and no pending task was missed by the
  backfill.
- Write findings as the phase review round and resolve or escalate them before
  the phase is locked.

## Completion

- [ ] All findings are resolved or escalated with a reason
- [ ] `sizing --human` and the error diagnostics were exercised and recorded
- [ ] `bun run --cwd packages/specs test` passes
- [ ] `bun run --cwd packages/specs cli check --dir "$PWD"` reports zero errors
- [ ] The review round is linked with `- Phase: A`
