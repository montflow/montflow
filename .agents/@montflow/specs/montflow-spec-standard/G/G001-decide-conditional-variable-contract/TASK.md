---
id: G001
name: decide-conditional-variable-contract
type: planning
originator: user
size: tiny
depends-on:
related-tasks: G002, G003, G004
status: complete
write-scope: none
---

# Task G001: decide the conditional-variable contract

## Type: planning

## Description

The prompt schema treats every declared variable as always visible, and the
interactive fill asks every one in order. The `spec-create` prompt needs a
branch: ask "In an isolated branch?" and only when the answer is yes ask the
origin and the worktree/branch name. A flat list cannot express that without
asking irrelevant questions or rendering empty values into the branch it was
supposed to hide. Decide the conditional-variable contract once, precisely
enough that the schema, the verifier, the renderer, the interactive fill, the
CLI, and the workspace editor all implement the same rule.

## Requirements

- **Discriminated union.** Define the variable kinds and the fields each one
  owns. Keep `text`, `textarea`, and `select`; decide whether a boolean
  `confirm` kind is added or the branch controller is a `select` with explicit
  values. Give the exact JSON shape for every kind. The condition itself is a
  discriminated union: a visibility rule names an earlier variable and either
  an exact option value or a truthy value, and no other form is accepted.
- **Visibility condition.** A variable may declare `when` (or the decided
  name): the controller variable name, the matching kind (`equals` for a
  discrete value, `truthy` for a boolean), and nothing else. The controller must
  be declared earlier in the list, must be `select` or `confirm`, and must be
  compared against an option it actually declares. No forward references, no
  cycles, no text or textarea controllers.
- **One visibility rule.** Define `isVisible` as a pure function of the declared
  variables and collected values, using the effective value (supplied, else
  default, else empty). Every consumer calls it: `resolveValues`,
  `missingRequired`, `renderPrompt`, `verifyPrompt`, `fillInputs`,
  `PromptExecute.inspect`/`table`, the CLI `render`/`execute` key=value path, and
  the workspace editor. No consumer re-derives visibility.
- **Hidden semantics.** A hidden variable resolves to the empty string, so a
  `{{#if name}}` guard takes its `{{else}}` branch. A hidden `required` variable
  is never missing. A stale answer is cleared when its controller changes, so a
  yes→no→yes sequence cannot resurrect a worktree name from the first pass. A
  hidden variable is never asked and never shown as missing.
- **Verification.** Name each invalid condition, its message, and its fix:
  unknown controller, controller declared later, duplicate controller entry,
  non-discrete controller, `equals` value not in the controller's options, a
  conditional variable the template never uses, and a template branch whose
  `{{#if}}` name has no matching `when`. Keep the existing first-appearance
  order and bijection checks.
- **Backward compatibility.** A variable without `when` is always visible. Every
  prompt currently installed under `.agents/@montflow/prompts/` and every
  package payload must verify unchanged, with no migration and no rewrite.
- **Authoring guidance.** State what `authoringRules()` and the
  `montflow-create-prompts` skill must say: when to use a branch instead of an
  optional variable, how to keep the `{{#if}}` guard aligned with `when`, why a
  conditional's controller must precede it, and why a hidden branch must never
  carry a default that would render.
- **Worked example.** Record the exact `spec-create` branch:
  `isolated` (select `yes`/`no`, required), `origin` (select
  `current`/`main`/`other`, required, visible when `isolated` is `yes`),
  `origin-branch` (text, required, visible when `origin` is `other`), and
  `worktree-name` (text, required, visible when `isolated` is `yes`). Show the
  full JSON and the matching template guards.

## Execution

Follow the phase `MEMORY.md` `## Execution Brief`: read only this task, that brief, and the scoped source; run each gate once; keep this task's `MEMORY.md` under 80 lines; batch review findings into one fixer attempt.

## Completion

- [x] `MEMORY.md` carries the exact JSON shape for every variable kind and every condition form
- [x] Every consumer's visibility behaviour is stated, including hidden required, stale-answer clearing, and first-appearance order
- [x] The verification table names each invalid condition, its message, and its fix
- [x] The worked `spec-create` example is complete enough to copy into the prompt
- [x] Backward compatibility is stated against every installed prompt
