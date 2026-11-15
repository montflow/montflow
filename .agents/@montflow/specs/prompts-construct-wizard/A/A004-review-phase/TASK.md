---
id: A004
name: review-phase
type: review
originator: user
size: medium
depends-on: A001, A002, A003
write-scope: none
related-tasks:
reviewer-profiles:
status: complete
---

# Task A004: review-phase

## Type: review

## Description

Review phase A end to end against the requirements in `SPEC.md`: the shared
`construct` engine stays model-free and reuses the shared validation, the
wizard collects type-matched inputs and offers profiles and the recommended
fallback, the binary and slash command expose only `construct` with `--wizard`
and `--copy`, the two legacy commands are gone, and the CLI and OpenCode
command share the same rendering and validation code. Each task gate is
verified and the phase is ready to lock.

## Requirements

- Verify every A001 requirement holds: `construct` requires no model and no
  doctor gate, applies defaults, and refuses missing/invalid inputs with the
  shared wording.
- Verify every A002 requirement holds: the prompt picker, type-matched controls,
  the profiles-backed select, the recommended-fallback choice, back/cancel
  navigation printing nothing, and the non-TTY refusal.
- Verify every A003 requirement holds: only `construct` (plus `--wizard` /
  `--copy`) is exposed, `render`/`execute` are removed from the binary, slash
  command, and docs, and CLI tests describe the single operation.
- Verify the CLI and the `/mf-prompts` command cannot drift: rendering and input
  validation are called from shared modules, not duplicated.
- Confirm `bun run --cwd packages/specs cli check --dir "$PWD" --name prompts-construct-wizard`
  reports zero issues and every task gate in A001/A002/A003 is checked.
- Confirm package verification for `packages/prompts` (`mf:check`, lint,
  format, typecheck, tests) is green.

## Completion

- [x] Done.