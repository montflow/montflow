# CLI app

Two front ends over one set of engines: the `mf-profiles` binary (Bun +
`effect/cli`) and the Pi slash command `/mf-profiles-cli`. Both
expose the same paths — list, show, verify, create, modify, delete — in the
same shape as [interactive](../interactive/CONTEXT.md). Neither opens a dialog
or spawns an agent: missing input fails with a message, so agents and scripts
can drive them mechanically (e.g. over `pi --mode rpc`).

## Belongs here

- `engines.apps.module.ts` — the operations (`list`, `show`, `create`,
  `modify`, `remove`, `verifyAll`, `filterByStatus`) plus `resolveListStatus`
  for `list --status valid|invalid`. Structured in, data out: no argv, no
  output. `verifyAll` also checks each profile's declared skills through
  [`SkillCheck`](../../modules/skill-check/CONTEXT.md)
- `renderers.apps.module.ts` — pure `data -> text`
- `binary.apps.module.ts` — the `Command` tree and `rootCommand`
- `cli.apps.module.ts` — the `/mf-profiles-cli` parser, `run`, and `register`;
  a hand-rolled parser because Pi passes one argument string, not an argv array
- `main.ts` — the binary entry

## Rules

- **Engines know nothing about argv or output.** Their failure is a displayable
  string. That is what lets the binary and the slash command share behaviour
  rather than duplicate it.
- **`--dir` is the workspace root**, not the profiles directory: the store is
  always `<root>/.agents/@montflow/profiles`, and the skills check reads
  `<root>/.agents/skills`. Default is the working directory.
- **A non-zero exit is set inside the handler** via `exitFailed`, not by failing
  the handler; `Command.run` would otherwise print a second error report.
  `process.exitCode` rather than `process.exit` leaves stdout to flush when piped.

## Does not belong here

- Dialog flows — those live in [interactive](../interactive/CONTEXT.md)
- Agentic workflows — those live in the interactive flows via the
  extension's generator/modifier ports
- Profile shapes, codecs, and file Effects — those live in
  `../../modules/pi-profiles/`
- Persistence — the `ProfileStore` service (`../../services/`), provided
  as `live` at invocation; Node layer provisioning stays in the
  extension entry
