---
name: prompts-construct-wizard
status: complete
workspace-type: worktree
author: montflow
created: 2026-11-15
spec-version: 2
---

# prompts-construct-wizard

## Description

The `mf-prompts` CLI exposes both `render` and `execute`, but both print the
rendered prompt. `execute` additionally runs the doctor preflight gate and
requires a model, yet the binary owns no `ModelRuntime` and never runs an
agent — so a user typing `mf-prompts execute` cannot tell "this printed what
would be sent" from "this ran the prompt". The command names and behaviour are
confusing, and the `--model` flag / doctor gate promise more than the binary
delivers.

This spec replaces both commands with one `construct` command that only
validates, fills, and prints:

    mf-prompts construct <prompt-name> [key=value ...]

`construct` requires the prompt name and every required variable, applies
declared defaults, renders the template, and prints the result to stdout. It
does not require a model and never invokes an agent; its doctor gate is
removed along with the `--model` flagcars. Invalid or missing inputs fail with
actionable messages, the same shared wording the interactive fill already uses.

A `--wizard` mode collects the same inputs interactively: an optional picker
for the prompt name, type-matched controls per variable, a profiles-backed
select for a `profile` variable, and an explicit "use recommended fallback"
choice for an optional variable with a declared fallback — while letting the
user navigate back and cancel cleanly. Rendering and input validation stay in
shared modules (`prompts`, `prompt-execute`) so the CLI and the OpenCode
`/mf-prompts` command cannot drift. `--copy` (nice to have) also places the
constructed output on the system clipboard.

## Requirements

- `mf-prompts construct <prompt-name> [key=value ...]` replaces both `render`
  and `execute`: it validates the name, requires every visible required
  variable, applies declared defaults, renders the template, and prints the
  rendered text to stdout.
- `construct` requires no model and never runs an agent; it carries no
  `--model` flag and no doctor preflight gate. A prompt that pins no model
  still constructs.
- Missing or invalid inputs fail with actionable messages using the shared
  wording: unknown prompt names name `list`, a missing required variable names
  it, and a rejected discrete value names the offered options. `--wizard` and
  `--copy` never print a partial prompt on failure or cancellation.
- `construct --wizard` opens the interactive flow. With no prompt name it shows
  a picker of the workspace prompts (the same list `list` returns); when a name
  is supplied it skips the picker.
- The wizard collects each visible variable with a control matching its
  declared type: a `select` is a list of its options, a `confirm` a yes/no
  dialog, and `text`/`textarea` a free-text input; an answered variable or a
  defaulted one is not re-asked. Visibility follows `Prompts.isVisible`.
- A variable named for a profile (the prompt's `profile`-like variable) offers
  the available profiles from `.agents/@montflow/profiles/` as a selectable
  list instead of free-typed slugs.
- An optional variable with a prompt-declared fallback offers "use recommended
  fallback" as an explicit selectable choice beside entering a custom value;
  choosing it preserves the prompt's fallback behaviour (leaving the variable
  blank so the template's `{{else}}` branch applies), and the variable
  description is shown so the user understands the recommendation.
- The wizard supports navigating back to prior choices and cancel; cancellation
  must not print a partial constructed prompt or start an agent.
- Non-interactive use keeps the `key=value` form. In a non-TTY environment
  `--wizard` reports an actionable error instead of opening controls.
- `--copy` (nice to have) puts the constructed output on the system clipboard
  in addition to printing it to stdout.
- CLI help, USAGE, the slash-command description, documentation, and tests
  describe the single `construct` operation and its wizard mode, and the two
  overlapping `render` and `execute` commands are removed from the binary, the
  slash command, and the interactive menu.
- Rendering and input validation live in shared code (`modules/prompts`,
  `modules/prompt-execute`) consumed by both the CLI and the OpenCode command,
  so the surfaces cannot drift.
- Package tests, `mf:check`, lint, format, and typecheck stay green.

## Creation

- rigor: standard
- questions 0/2
- unresolved: none

## Tasks

| ID   | Name                  | Type      | Status  | Gates |
| ---- | --------------------- | --------- | ------- | ----- |
| A001 | construct-engine | execution | complete | Yes |
| A002 | construct-wizard | execution | complete | Yes |
| A003 | wire-construct-command | execution | complete | Yes |
| A004 | review-phase | review | complete | No |