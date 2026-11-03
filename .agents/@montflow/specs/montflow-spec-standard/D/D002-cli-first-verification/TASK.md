---
id: D002
name: cli-first-verification
type: execution
originator: user
size: medium
depends-on: C006, C007
related-tasks: D001
status: pending
---

# Task D002: make CLI verification first

## Type: execution

## Description

D001 fixes profile discovery in spec authoring. The same pattern survives in the
other authoring skills: they scan the store by hand, then verify by eye, while a
CLI already answers both. `montflow-create-prompts` tells the author to list and
read every skill and then run a seven-point manual self-check, but never calls
`mf-prompts verify`; `montflow-create-profiles` and `montflow-modify-profiles`
scan skills by hand and never call `mf-profiles verify`; the review skill
computes the next round with `ls` even though `mf-reviews` already names it; and
the generic skill-discovery skills Glob/Grep the store while `mf-skills list`
prints every name with its description. Make the CLI the first move and leave
manual inspection for what the CLI cannot judge.

## Requirements

- `montflow-create-prompts` replaces the manual skill scan with `mf-skills list`
  (descriptions included), keeps `mf-skills show` for the full file, and makes
  `mf-prompts verify <name>` the mandatory self-check for create and modify.
  The seven measured rules stay as the explanation of what verify checks.
- `montflow-create-profiles` and `montflow-modify-profiles` use `mf-skills list`
  for skill names and `mf-profiles verify <name>` as the mechanical verify, which
  already checks the file shape and every declared skill. The GATES.md and the
  subjective checklist stay for what the verifier cannot judge.
- `montflow-adversarial-review` takes the round from the CLI: `mf-reviews resume
  <name>` for a re-review, `mf-reviews create <name>` (next free round by
  default) for a new one, and `mf-reviews list --verbose` for discovery. An
  explicit `- Round:` from a dispatch stays authoritative. The `ls`/glob
  highest-plus-one rule is removed, and the isolation rule against reading
  another round's contents is unchanged.
- `finding-skills` and `executing-skills` try `mf-skills list` first and fall
  back to Glob/Grep only when the binary is unavailable, stating the fallback.
- Every instruction names the in-repo form (`bun run --cwd packages/<pkg> cli
  <verb> --dir "$PWD"`) where the binary may not be on `PATH`.
- Package and workspace skill copies stay byte-identical; the prompts, skills,
  and reviews doctor payloads match the package bytes; `doctor --check` reports
  no drift.
- A test fails when any of the above skills drops its CLI step and returns to
  the manual rule alone; the test asserts the command name, not a prose phrase.
- No new `mf-specs check` finding is added to any spec.

## Execution

Follow the phase `MEMORY.md` `## Execution Brief`: read only this task, that brief, and the scoped source; run each gate once; keep this task's `MEMORY.md` under 80 lines; batch review findings into one fixer attempt.

## Completion

- [ ] `montflow-create-prompts` names `mf-skills list` and `mf-prompts verify <name>` on create and modify
- [ ] Both profile skills name `mf-skills list` and `mf-profiles verify <name>`
- [ ] The review skill takes its round from `mf-reviews` and keeps explicit rounds authoritative
- [ ] The two discovery skills use `mf-skills list` first, with a stated fallback
- [ ] Package, workspace, and doctor payload copies agree and `doctor --check` is silent
- [ ] A test covers each CLI-first instruction and fails when it is removed
- [ ] `ts:check`, `lint:check`, `fmt:check`, and `mf:check` pass
