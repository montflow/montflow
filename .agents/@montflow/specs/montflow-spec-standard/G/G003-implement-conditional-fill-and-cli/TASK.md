---
id: G003
name: implement-conditional-fill-and-cli
type: execution
originator: user
size: tiny
depends-on: G002
related-tasks: G004
status: pending
write-scope: packages/prompts/src/apps/interactive, packages/prompts/src/apps/cli, packages/prompts/src/modules/prompt-execute
---

# Task G003: implement conditional fill and the CLI surfaces

## Type: execution

## Description

The interactive fill currently asks every declared variable through a single
line input, so a `select` is never offered as a list and a conditional branch
would still be asked on the path it was meant to hide. Make the `/mf-prompts`
fill flow and the headless `render`/`execute` path honour the G002 visibility
rule and the declared variable kinds.

## Requirements

- Rewrite `fillInputs` to iterate in declared order and recompute visibility
  after each answer. Ask `select` through `ui.select` with its options, text and
  textarea through `ui.input`, and a boolean kind through `ui.confirm` when G001
  adds one; never ask a hidden variable.
- When a controller changes, clear the answers of every variable it hides, so a
  yes→no→yes sequence asks again instead of reusing a stale value. A re-fill
  keeps only answers that are still visible.
- `PromptExecute.inspect` and `table` expose the condition and whether a
  variable is currently visible; `missing` counts only visible required
  variables. The CLI `render` and `execute` key=value paths validate a supplied
  value against the visible variable's kind and options, ignore a value for a
  hidden variable, and never make it visible.
- Invalid input names the variable, its kind, and its allowed options, with the
  same message the verifier would produce for a malformed prompt. A select
  value outside its options is refused, not silently rendered.
- Tests cover the yes path, the no path, a yes→no switch that clears the hidden
  answers, a required hidden variable that is not missing, a select default, and
  CLI `render`/`execute` parity with the interactive answers.

## Execution

Follow the phase `MEMORY.md` `## Execution Brief`: read only this task, that brief, and the scoped source; run each gate once; keep this task's `MEMORY.md` under 80 lines; batch review findings into one fixer attempt.

## Completion

- [ ] A select is offered as a list, not a free-text line
- [ ] A hidden variable is never asked, required, or rendered from a stale answer
- [ ] Switching the controller clears every hidden answer
- [ ] CLI `render`/`execute` accept exactly what the interactive fill accepts
- [ ] `PromptExecute.inspect`/`table` show the condition and visibility
