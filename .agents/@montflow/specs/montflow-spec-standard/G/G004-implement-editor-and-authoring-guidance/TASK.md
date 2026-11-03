---
id: G004
name: implement-editor-and-authoring-guidance
type: execution
originator: user
size: medium
depends-on: G002
related-tasks: G001, G003
status: pending
---

# Task G004: implement the editor and authoring guidance

## Type: execution

## Description

A conditional variable is only useful if the workspace prompt editor can create
and preserve it and if the prompt-authoring agent knows the shape. Today the
editor round-trips the flat variable fields, and the authoring rules describe
only the flat form, so a hand-authored condition would be dropped on save and an
agentic prompt author would never produce one.

## Requirements

- Extend the workspace prompt service and editor to round-trip the G001
  condition field. The detail view shows the controller and value plus whether a
  variable is currently hidden; the editor lets a user choose a controller from
  the earlier discrete variables and one of its options, and refuses a condition
  that G001 rejects.
- Update `Prompts.authoringRules()` to document the discriminated union, the
  condition grammar, the earlier-controller rule, the `{{#if}}` guard alignment,
  and the hidden-branch rule. Keep it the single source of truth; the agentic
  create/modify preprompt embeds it.
- Restate the same contract in the packaged `montflow-create-prompts` skill and
  its changelog, and in the prompts package README/wiki where the variable shape
  is documented. The skill must show one conditional example.
- Tests cover the editor round-trip, the detail rendering of a condition, the
  refusal of an invalid condition, and a drift assertion that the authoring
  rules and the packaged skill both mention the condition field and the
  earlier-controller rule.

## Execution

Follow the phase `MEMORY.md` `## Execution Brief`: read only this task, that brief, and the scoped source; run each gate once; keep this task's `MEMORY.md` under 80 lines; batch review findings into one fixer attempt.

## Completion

- [ ] Saving and reopening a conditional prompt preserves the condition byte-for-byte
- [ ] The editor refuses an unknown controller, a later controller, or a value outside the controller's options
- [ ] The detail view marks a hidden variable without changing its stored value
- [ ] `authoringRules()` and the packaged skill both state the condition grammar and the guard rule
- [ ] The drift test fails if either guidance loses the condition field
