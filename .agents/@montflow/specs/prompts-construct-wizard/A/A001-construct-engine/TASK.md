---
id: A001
name: construct-engine
type: execution
originator: user
size: medium
depends-on: 
write-scope: packages/prompts/src/modules/
related-tasks:
status: pending
---

# Task A001: construct-engine

## Type: execution

## Description

Add a shared, model-free `construct` operation in `packages/prompts/src/modules/`
that validates, fills, and renders a prompt to its final text — the behaviour
the new CLI `construct` command and the `/mf-prompts` slash command both call.
It must not require a model and must not run a doctor gate, unlike today's
`execute` engine.

## Requirements

- New engine function `construct` (in `modules/prompt-execute` alongside
  `inspect`/`execute`, or a sibling module) takes a prompt descriptor plus
  supplied `values`, and returns the rendered text or a displayable refusal —
  never a plan that requires a model.
- It reuses the existing shared rules: `resolveInputs` accepts values for
  visible variables only, `missingRequired` demands every visible required
  variable, and `Prompts.renderPrompt`/`renderToString` produce the text.
- It applies declared defaults exactly as today (a variable with a `default`
  stands even when nothing is supplied) and runs the same file-level
  verification the interactive fill runs, so `construct` accepts exactly the
  files `render`/`execute` accept.
- No model resolution and no doctor gate: a prompt that pins no model still
  constructs, and the invocation strings used in refusals name `construct`,
  not `execute`.
- Missing or invalid inputs fail with the shared actionable wording: an unknown
  prompt names `list`; a missing required variable is named; a rejected
  discrete value names its offered options (`invalidOptionMessage` /
  `invalidConfirmMessage`).
- A non-interactive caller can call it with `{ name, values }` and receive the
  final text, so the CLI prints it and the wizard prints it after collecting
  inputs through the same engine.
- Unit tests in `packages/prompts/src/modules/prompt-execute/tests/` cover:
  a fully-supplied render, a default applied when a value is omitted, a missing
  required variable refused, an invalid discrete value refused, an invalid
  prompt file refused, and a prompt with no model constructing successfully.

## Execution

Read the phase `A/MEMORY.md` `## Execution Brief` and this task's `GATES.md`;
write only within `packages/prompts/src/modules/` plus this task's records.

## Completion

- [ ] Done.