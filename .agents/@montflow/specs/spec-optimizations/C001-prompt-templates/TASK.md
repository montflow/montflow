---
id: C001
name: prompt-templates
type: execution
originator: user
size: medium
depends-on: A003, B002
related-tasks:
status: complete
---

# Task C001: prompt-templates

## Type: execution

## Description

Replace the inline prompt assembly with shipped templates. `packages/specs/prompts/`
becomes the only source of author and execute prompt text, and a loader reads and
renders it through `@montflow/prompts` instead of concatenating TypeScript
strings.

## Requirements

- Rewrite `packages/specs/prompts/spec-create.json` and `spec-execute.json` to
  match the contract this spec actually ships. Drop the stale tier, phase
  directory, and `new-phase` / `new-task` prose the workspace copies currently
  carry.
- `spec-create.json` variables: `request` (required), optional `notes`. Skills:
  `montflow-create-specs`.
- `spec-execute.json` variables: `name` (required), `state` (required),
  `next` (required), `reviewBudget` (required), optional `phase`, `focus`,
  `unsupervised` (the internal flag for the public `autonomous` mode). Skills:
  `montflow-find-specs`, `montflow-adversarial-review`,
  `montflow-addressing-adversarial-review`.
- Delete `packages/specs/src/skills/` and its drift test. Skill bodies exist
  only in `skills/`; the template names them and the executor loads them.
- Rewrite `modules/prompt` as a loader/renderer over the prompt store: load the
  named prompt, verify it, render with the caller's values, and return the text
  plus the skills the caller must load. No template text in TypeScript.
- Add `@montflow/prompts` as a workspace dependency of `packages/specs`; reuse its
  prompt store, verifier, and renderer rather than reimplementing them.
- Gate on doctor: a missing or stale `spec-create` / `spec-execute` prompt fails
  before rendering, with a coded diagnostic naming the file, the problem, and
  `mf-specs doctor` as the fix.
- The execute template states the review-cycle budget it was given: open a
  reviewer round only while the series has fewer rounds than the budget, and at
  the cap escalate every remaining finding to the user instead of opening
  another round. A phase made only of `tiny` tasks therefore gets one cycle.
- Update `modules/index.ts`, the package index, and the existing prompt tests.
- Sync the workspace copies by running `mf-specs doctor`; do not hand-edit them.

## Completion

- [ ] `grep -rn "buildAuthorPrompt\|buildResumePrompt\|AUTHORING_SPEC\|EXECUTING_SPEC" packages apps` returns nothing
- [ ] `packages/specs/src/skills` no longer exists
- [ ] Loader tests render both prompts, assert the declared skills, and fail on a missing prompt
- [ ] The execute template refuses a fourth review round and names the budget
- [ ] `bun run mf:check:specs` and `mf:check:prompts` pass
- [ ] `bun run --cwd packages/specs test`, `lint:check`, `format:check`, and `ts:check` pass
