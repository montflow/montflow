---
id: C006
name: ship-spec-artifact-payloads
type: execution
originator: planner:B005
size: medium
depends-on: A004, C004, C005
related-tasks: B003
status: complete
---

# Task C006: ship spec artifact payloads

## Type: execution

## Description

Main already ships `spec-create`, `spec-execute`, and `spec-sizing` from
`packages/specs/prompts` through `doctor`, and the six spec-role profiles exist
in `.agents/@montflow/profiles/` as workspace files. Turn the profiles into
installed package payload, add the tier files, and align every shipped prompt and
skill to the v2 vocabulary the earlier tasks created.

## Requirements

- The six spec-role profiles (`spec-appraiser`, `spec-bookkeeper`, `spec-creation-orchestrator`, `spec-execution-orchestrator`, `spec-worker`, `spec-sizing-orchestrator`) move into a package payload directory and install through `doctor`; a fresh clone obtains them and nothing is hand-copied. `spec-sizing-orchestrator` is included because the shipped `spec-sizing` prompt names it.
- The shipped `spec-create`, `spec-execute`, and `spec-sizing` prompts are rewritten for v2: phase directories, derived locks, no reserved review task, tier selection, the `## Creation` section (`tier`, the creation run's self-reported/advisory `questions n/budget`, unresolved decisions), the orchestrator-only authority for `claim --start`/`--block`/`--close` and an orchestrator `claim --release` that resets a task to `pending`, plus `gate run` and `mail`, and the verbs that now exist. They stay the canonical copies in `packages/specs/prompts`.
- Tier instruction files ship as payload and are the only place a tier artifact matrix and interaction budget appears; B003's drift test keeps enum, files, and skill text aligned.
- Profiles and prompts reference only verbs that exist, and every `skills:` reference resolves under the A004 checker.
- `model` stays unset in every shipped artifact unless a model is chosen explicitly here, and the split verdict and tier wording match B003 verbatim.

## Completion

- [x] A clean workspace gains all artifacts via the repair command, and report-only mode then stays silent with zero issues
- [x] Exactly six spec-role profiles are installed (the five spec roles plus `spec-sizing-orchestrator`), and every `skills:` reference in every profile and prompt resolves
- [x] Authoring and execution skills reference only verbs that exist, verified by grepping each command named
- [x] The shipped prompts name `claim --start`/`--block`/`--close` and the orchestrator `--release` reset, `gate run`, and `mail` as orchestrator-only, and present `questions n/budget` as self-reported/advisory
- [x] `bun run mf-specs:check` passes and changelog entries exist where behavior changed
