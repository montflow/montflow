# CLI app

Headless `/mf-prompts-cli` command for the prompts extension — the same
paths as [interactive](../interactive/CONTEXT.md) (list, show, render,
create, modify) expressed as flags and params. Never opens a dialog:
missing input fails with a message, so agents and scripts can drive it.

## Belongs here

- Headless arg parsing (`parseCliArgs`, `CliAction`, `CliFields`)
- Non-interactive run (`run`) reusing interactive's notify-only flows
  (`listPrompts`, `showPrompt`) and shared parsers (`tokenize`,
  `collectValues`, `variables`)
- Command registration (`register`, `COMMAND_NAME`)

## Does not belong here

- Dialog flows — those live in [interactive](../interactive/CONTEXT.md)
- Prompt shapes, codecs, and file Effects — those live in
  `../../modules/prompts/`
- Persistence — the `PromptStore` service (`../../services/`), provided
  as `live` at invocation; Node layer provisioning stays in the
  extension entry
