# CLI app

Headless `/mf-profiles-cli` command for the profiles extension — the same
paths as [interactive](../interactive/CONTEXT.md) (list, show, create,
modify, delete) expressed as flags and params. Never opens a dialog and
never spawns an agent: missing input fails with a message, so agents and
scripts can drive it mechanically (e.g. over `pi --mode rpc`).

## Belongs here

- Headless arg parsing (`parseCliArgs`, `CliAction`, `CliFields`)
- Non-interactive run (`run`) reusing interactive's notify-only flows
  (`listProfiles`, `showProfile`) and shared parsers (`tokenize`)
- Command registration (`register`, `COMMAND_NAME`)

## Does not belong here

- Dialog flows — those live in [interactive](../interactive/CONTEXT.md)
- Agentic workflows — those live in the interactive flows via the
  extension's generator/modifier ports
- Profile shapes, codecs, and file Effects — those live in
  `../../modules/pi-profiles/`
- Persistence — the `ProfileStore` service (`../../services/`), provided
  as `live` at invocation; Node layer provisioning stays in the
  extension entry
