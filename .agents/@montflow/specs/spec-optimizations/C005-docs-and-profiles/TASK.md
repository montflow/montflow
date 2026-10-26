---
id: C005
name: docs-and-profiles
type: execution
originator: user
size: small
depends-on: C004
related-tasks:
status: complete
---

# Task C005: docs-and-profiles

## Type: execution

## Description

Teach the new flow where agents and humans look for it. The docs, the authoring
skill, and the two spec orchestrator profiles describe loading prompts by name,
the author/execute commands, and the guided/autonomous contract.

## Requirements

- Update `packages/specs/README.md`: the CLI section gains `author`, `execute`,
  and `which`, the library section names the prompt loader and the shipped
  templates, and a short example shows `mf-specs execute --mode autonomous`
  resolving the spec from `feat/<name>`.
- Document the branch convention (`<prefix>/<feature-name>`), exact-then-prefix
  matching, and the ask-the-user rule when detection fails.
- Document the review budget table (`tiny` 1, `small` 2, `medium` 3, `large` 3)
  and the hard cap of 3, including that a tiny-only phase gets one cycle.
- Update `packages/specs/skills/montflow-create-specs/SKILL.md` and
  `montflow-find-specs/SKILL.md` to point at the prompt names and the commands
  instead of inline prompt text. Bump versions and add CHANGELOG entries; keep
  the `.agents/skills/` mirrors byte-identical.
- Update `.agents/@montflow/profiles/spec-creation-orchestrator/PROFILE.md` and
  `spec-execution-orchestrator/PROFILE.md`: author loads `spec-create`, execute
  loads `spec-execute`, `guided` is the default, and `autonomous` asks only
  for destructive actions, very dangerous tool calls, or undecidable decisions.
- Update `AGENTS.md` and the relevant `CONTEXT.md` files where they describe the
  old `buildAuthorPrompt` / injected-skill setup.
- Sync the workspace prompts with `mf-specs doctor`; never hand-edit
  `.agents/@montflow/prompts/spec-create.json` or `spec-execute.json`.
- Leave completed spec records and old CHANGELOG entries untouched.

## Completion

- [ ] README documents `author`, `execute`, `which`, the prompt names, both modes, and branch detection
- [ ] Both profile files state the guided default and the autonomous exception list
- [ ] The package and workspace skill copies stay byte-identical
- [ ] `bun run mf:check` passes
- [ ] `bun run --cwd packages/specs lint:check`, `format:check`, and `ts:check` pass
