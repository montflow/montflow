# Memory

## Context

Add the interactive `--wizard` flow for `construct` in `apps/interactive`: collect
every variable with a type-matched control, offer profiles for a profile-shaped
select, support back/cancel, then render through the shared `construct` engine.

## Progress

- complete

## Findings

- `constructWizard(ui, cwd, name?, options?)` added to
  `packages/prompts/src/apps/interactive/interactive.apps.module.ts`, returning
  the constructed text via `PromptExecute.construct` — it never duplicates
  validation or rendering.
- With no `name` it shows a prompt picker (the `PromptStore.list` list); an
  unknown name fails naming `mf-prompts list`.
- Each question is a picker over the variable's natural choices plus `← Back`
  (and `Use recommended fallback` for an optional guard variable): a `select`
  lists its options, a `confirm` offers yes/no, `text`/`textarea` opens a
  free-text input. Back re-asks a prior variable; cancellation prints nothing.
- A profile-shaped `select` (name matches `/profile/i`) is offered from the
  `@montflow/profiles` `ProfileStore.list` service; with no profiles it degrades
  to declared options.
- `hasFallback` = variable guards a branch (`analyze(...).conditionals`) and is
  not required; blanking it uses the `{{else}}` branch.
- Non-TTY is refused here via `NON_TTY_MESSAGE` when `options.interactive` is
  false (the CLI passes that after detecting a missing TTY).
- `@montflow/profiles` is imported in the module; it is resolvable through the
  workspace root `node_modules` even though `packages/prompts/package.json`
  does not declare it — note this for the phase-wide package check.

## Gates

- A002 official gate stage 0 (mechanical) passed once via `gate run`
  (fingerprint a4e7951d…, exit 0).

## Open Questions

- None.

## Handoff

- A003 wires `constructWizard` into the CLI `--wizard` flag and the slash
  command, and removes `render`/`execute`.

## Deviations

- None.