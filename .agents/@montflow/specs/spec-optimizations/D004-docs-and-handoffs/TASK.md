---
id: D004
name: docs-and-handoffs
type: execution
originator: user
size: small
depends-on: D003
related-tasks:
status: complete
---

# Task D004: docs-and-handoffs

## Type: execution

## Description

Teach the new flow where creators and executors look for it. README, the
authoring skill, and the creation/execution profiles describe the wizard order,
catalogue-driven config generation, the effort-from-variants rule, open versus
fixed scope, and the handoff to the sizing role.

## Requirements

- Add a "Generating a sizing config" section to `packages/specs/README.md`: the
  wizard order (show existing config, ask scope, inventory catalogue, propose,
  confirm, write, verify), why the config is generated from the live catalogue,
  `mf-specs models` and `models --verify`, the effort-from-variants rule (unknown
  variants mean no effort), the four-size proposal, `inherit`, open vs fixed
  scope, the merge rule, and the proof loop. Include one transcript using
  placeholder model ids.
- List `spec-sizing` beside `spec-create` and `spec-execute` everywhere the
  shipped spec prompts are enumerated, and document `sizing-config`,
  `spec_sizing`, and `/specs sizing-config`.
- Update `packages/specs/skills/montflow-create-specs/SKILL.md` so the author
  knows: a task's size is still chosen while authoring, but a spec's config is
  generated afterwards through `spec-sizing`; never type a model id or an effort
  into a config by hand. Bump the version and add a CHANGELOG entry.
- Keep `.agents/skills/montflow-create-specs/SKILL.md` byte-identical to the
  package copy.
- Update `.agents/@montflow/profiles/spec-creation-orchestrator/PROFILE.md` and
  `spec-execution-orchestrator/PROFILE.md` with the handoff: when a spec or phase
  has no tuned config and the user wants one, dispatch the sizing role; never let
  a worker guess a model or an effort.
- Name `spec-sizing-orchestrator` as the role that loads `spec-sizing` in each
  profile that references it.
- Leave completed spec records and old CHANGELOG entries untouched.

## Completion

- [ ] README documents the wizard order, catalogue, `--verify`, the effort rule, open vs fixed scope, `inherit`, merge, and proof
- [ ] The authoring skill states the authoring-vs-generation boundary and its mirror is byte-identical
- [ ] Both spec orchestrator profiles hand off to the sizing role without guessing a model
- [ ] `bun run mf:check` passes
- [ ] `bun run --cwd packages/specs lint:check`, `format:check`, and `ts:check` pass
