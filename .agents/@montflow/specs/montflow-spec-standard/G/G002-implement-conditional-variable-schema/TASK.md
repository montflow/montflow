---
id: G002
name: implement-conditional-variable-schema
type: execution
originator: user
size: medium
depends-on: G001
related-tasks: G003, G004
status: pending
---

# Task G002: implement the conditional-variable schema

## Type: execution

## Description

Land the decided conditional-variable shape in `@montflow/prompts` as schema and
pure resolution, with no UI work. After this task, a prompt can declare a
variable that is visible only when an earlier discrete variable has a chosen
value, `verify` accepts it and rejects every invalid condition, and rendering a
hidden branch produces empty substitutions instead of stale answers.

## Requirements

- Extend `Variable` with the decided condition field and keep `VariableEntry`
  round-tripping to the minimal on-disk object. A variable without a condition
  encodes exactly as it does today.
- Add a pure `isVisible(variable, values)` (and the ordered visibility helper the
  consumers need) using the effective value: supplied, else `default`, else
  empty. Export it from the prompts module so every consumer shares it.
- Make `resolveValues`, `missingRequired`, and `renderPrompt` honour visibility.
  A hidden variable resolves `''`, is never missing, and never renders. A
  visible variable behaves exactly as before.
- Extend `verifyPrompt` with every G001 rule and its fix string: unknown
  controller, controller declared later, non-discrete controller, invalid
  `equals`, duplicate names, and any condition the template cannot honour. Keep
  the existing bijection and ordering checks intact.
- Keep every installed prompt and package prompt valid; add a fixture that
  proves the old shape is untouched, plus visible, hidden, required-hidden, and
  stale-answer-cleared cases.
- Tests cover the encode/decode round-trip, each verify accept/reject, the
  effective-value rule, hidden required, hidden rendering, and the old-prompt
  compatibility fixture.

## Execution

Follow the phase `MEMORY.md` `## Execution Brief`: read only this task, that brief, and the scoped source; run each gate once; keep this task's `MEMORY.md` under 80 lines; batch review findings into one fixer attempt.

## Completion

- [ ] The condition field round-trips and a prompt without one is byte-identical on encode
- [ ] `isVisible` is exported and is the only visibility rule used by resolution and rendering
- [ ] A hidden required variable is not reported missing and renders as empty
- [ ] Every invalid condition from G001 fails with its coded message and fix
- [ ] The existing prompt fixtures still verify clean
