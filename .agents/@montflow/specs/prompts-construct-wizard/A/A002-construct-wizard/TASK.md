---
id: A002
name: construct-wizard
type: execution
originator: user
size: large
depends-on: A001
write-scope: packages/prompts/src/apps/interactive/
related-tasks:
status: pending
---

# Task A002: construct-wizard

## Type: execution

## Description

Add the interactive `--wizard` flow for `construct` in
`packages/prompts/src/apps/interactive/`: collect every variable with a control
that matches its declared type, offer profiles for a profile-shaped variable,
and let the user back out of prior choices or cancel cleanly — then render
through the shared `construct` engine from A001. It is invoked with or without
a prompt name already supplied.

## Requirements

- A `constructWizard` flow takes a prompt name (or none), the workspace cwd, and
  the interactive UI port; with no name it shows a picker of the available
  workspace prompts (`list`), and with a name it skips that picker. Cancel or an
  unknown name fails without printing a partial prompt.
- Variables are collected with a control matching their declared type: a
  `select` is a list of its options, a `confirm` a yes/no dialog, and
  `text`/`textarea` free text; a variable that already has a value (supplied or
  defaulted) is not re-asked, and visibility follows `Prompts.isVisible`.
- A variable named for a profile (a `select` whose name indicates a profile,
  e.g. `profile`) is offered the available profiles from
  `.agents/@montflow/profiles/` as its selectable list, read through the
  `ProfileStore.list` service, instead of free-typed slugs. When no profiles
  exist, the variable degrades to its declared options or free text.
- An optional variable with a prompt-declared fallback offers "use recommended
  fallback" as an explicit selectable choice beside entering a custom value;
  selecting it leaves the variable blank so the template's `{{else}}` branch
  applies, and the variable `description` is shown so the user understands the
  recommendation.
- The user can navigate back to a prior variable and re-answer it, and can
  cancel the whole flow; cancellation and back never render or print a partial
  constructed prompt and never start an agent.
- After collecting inputs the flow renders through the shared `construct`
  engine (A001) and returns the final text for the caller to print; it does not
  duplicate validation or rendering.
- Non-TTY is detected and reported here: when `--wizard` is requested in an
  environment with no interactive controls available, the flow fails with an
  actionable message telling the caller to use the `key=value` form, rather than
  hanging or emitting partial output.
- Tests in `packages/prompts/src/apps/interactive/tests/` cover: the prompt
  picker when a name is omitted, a select rendered from its options, a
  confirm dialog, a profile variable offered from the profile store, the
  recommended-fallback choice for an optional defaulted variable, navigating
  back, cancellation printing nothing, and the non-TTY refusal.

## Execution

Read the phase `A/MEMORY.md` `## Execution Brief` and this task's `GATES.md`;
write only within `packages/prompts/src/apps/interactive/` plus this task's
records.

## Completion

- [ ] Done.