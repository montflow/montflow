---
id: A003
name: wire-authoring
type: execution
originator: user
size: small
depends-on: A001, A002
related-tasks:
status: complete
---

# Task A003: wire-authoring

## Type: execution

## Description

Teach the authoring and execution flows to use sizing. The author must choose a
size for every task and know how config layers; the execution orchestrator must
pass the resolved target to `subagent` only when it is not `inherit`.

## Requirements

- Update `packages/specs/skills/montflow-create-pi-specs/SKILL.md`: document the
  four sizes, the review-cycle budget each one buys (`tiny` 1, `small` 2,
  `medium` 3, `large` 3, hard cap 3, phase budget is the largest task's), the
  decision the author must make per task, the two `sizing.json` locations and
  the phase override, the merge rule, and the `create` size token. Bump its
  version and add a CHANGELOG entry.
- Keep `.agents/skills/montflow-create-pi-specs/SKILL.md` byte-identical to the
  package copy.
- Update the canonical prompts in `packages/specs/prompts/spec-create.json` and
  `packages/specs/prompts/spec-execute.json`: creation picks a size for every
  task; execution reads the resolved target from `next`, `resolve`, or
  `sizing --task` and passes it as the `model` argument only when it is not
  `inherit`. The workspace copies are installed artifacts: copy them here, and
  B002 adds the doctor sync that keeps them current.
- Leave `packages/specs/src/skills/*` alone. Phase C deletes those injected
  copies and loads the packaged skills through the prompt templates instead.
- Update `.agents/@montflow/profiles/spec-creation-orchestrator/PROFILE.md` and
  `.agents/@montflow/profiles/spec-execution-orchestrator/PROFILE.md` with the
  same rules, including using `sizing --human` when a dispatch target is
  surprising or disputed.
- Document the config, `resolve`, `sizing`, and the diagnostic shape in
  `packages/specs/README.md`; lead with a repo-only example at
  `.agents/@montflow/specs/sizing.json`, then add a spec and phase override
  example. Use placeholder model ids, and show one example of an agent-facing
  error with code, fix, and cause.
- Do not add a real repo `sizing.json` or invent model ids in the workspace.

## Completion

- [ ] The package and workspace authoring skills are byte-identical
- [ ] The authoring skill states the size-to-review-cycle mapping and the cap of 3
- [ ] The canonical prompts live under `packages/specs/prompts/` and the workspace copies match them byte-for-byte
- [ ] The execution prompt and profile both state the `inherit` rule and the `sizing --human` inspection
- [ ] README shows a repo-only config, a phase override, and one full diagnostic
- [ ] `bun run mf:check:skills`, `mf:check:prompts`, and `mf:check:profiles` pass
- [ ] `bun run --cwd packages/specs lint:check`, `format:check`, and `ts:check` pass
