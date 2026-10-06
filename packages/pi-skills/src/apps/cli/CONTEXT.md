# CLI app

Two front ends over one set of engines: the `mf-skills` binary (Bun +
`effect/unstable/cli`) and the Pi slash command of the same name. A hand-rolled
parser for the slash form, a `Command` tree for the binary, and nothing shared
below the parser.

The interactive menu is a different command: `/mf-skills-tui`,
`../interactive/`.

## Belongs here

- `engines.apps.module.ts` — the operations (`list`, `load`, `verify`,
  `create`, `modify`, `remove`). Structured in, data out: no argv, no output.
- `renderers.apps.module.ts` — pure `data -> text`, carrying the **token
  contract** (lean by default, `--verbose` only adds, failures never suppressed)
- `binary.apps.module.ts` — the `Command` tree and `rootCommand`
- `slash.apps.module.ts` — the `/mf-skills` parser, `run`, and `register`
- `main.ts` — the binary entry

## Rules

- **Engines know nothing about argv or output.** They take structured
  arguments, return data, and fail with a displayable string. That is what lets
  the binary and the slash command share behaviour rather than duplicate it.
- **The store is `SkillStore`.** Engines call the node-fs IO module directly;
  neither front end touches the filesystem.
- **`--dir` overrides the workspace root**, not the skills directory: the store
  always reads `<root>/.agents/skills`. Default is the working directory.
- **A non-zero exit is set inside the handler** via `exitFailed`, not by failing
  the handler. Failing would make `Command.run` render a second error report on
  top of ours. `process.exitCode` rather than `process.exit` leaves stdout to
  flush when piped.
- **Verification is mechanical and pure.** `verify [name]` checks one skill or
  every skill under the root; a directory without a readable `SKILL.md` counts
  as invalid rather than aborting the run.

## Does not belong here

- Skill shapes, codecs, and verification — `../../modules/skill/`
- File IO — `../../modules/skill-store/`
- Doctor — [../doctor](../doctor/CONTEXT.md)
- Dialog flows — [../interactive](../interactive/CONTEXT.md)
- Agentic runs — [../runs](../runs/CONTEXT.md)

## Running

```bash
# from source (Bun required)
bun run --cwd packages/pi-skills cli list
bun run --cwd packages/pi-skills cli verify <name>

# standalone binary — Bun runtime embedded, no install, no node
bun run --cwd packages/pi-skills build:cli
./packages/pi-skills/dist/mf-skills list --verbose
```

`build:cli` is `bun build --compile`, preceded by `generate:payload` so the
bundle carries the skill-authoring skills (see [doctor](../doctor/CONTEXT.md)).
`dist/` is gitignored; the binary is a build artifact.
