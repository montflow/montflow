# Memory

## Context

Add the shared, model-free `construct` operation to `modules/prompt-execute` that
the new `construct` CLI command and the `/mf-prompts` slash command both call.

## Progress

- complete

## Findings

- `construct({ prompt, values, invocation? })` added to
  `packages/prompts/src/modules/prompt-execute/prompt-execute.module.ts`, alongside
  `inspect`/`execute`, returning a `ConstructResult` (ready `{ text }` or blocked
  with a displayable message). No model resolution and no doctor gate; a prompt
  that pins no model still constructs.
- Reuses the shared rules in the same decisive order as `execute` (minus the
  model check): empty template, unparseable template, file-level
  `verifyPrompt`, then `resolveInputs`/`inspect` (refusing rejected discrete
  values with `invalidOptionMessage`/`invalidConfirmMessage` and missing
  required variables), then `renderToString`.
- Refusal advice names `construct` (`DEFAULT_CONSTRUCT_INVOCATION =
  'mf-prompts construct'`), never `execute`.
- A confirm variable must be declared `required: false` and only guards a
  branch (it is never substituted), or file verification rejects it before the
  value check.

## Gates

- A001 official gate stage 0 (mechanical) passed once via `gate run`
  (fingerprint 13efa8…, exit 0).

## Open Questions

- None.

## Handoff

- A002 (`construct-wizard`) consumes `construct` from A001 to render after
  collecting inputs; A003 wires it into the CLI/slash command.

## Deviations

- None.