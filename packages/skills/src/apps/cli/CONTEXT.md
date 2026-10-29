# CLI app

Two front ends over one set of engines: the `mf-skills` binary (Bun +
`effect/cli`) and the OpenCode slash command of the same name. A hand-rolled
parser for the slash form, a `Command` tree for the binary, and nothing shared
below the parser.

The interactive module is used by dispatch sessions, not a command:
`../interactive/`. The TUI picker behind `/mf-skills` browses the store.

## Belongs here

- `engines.apps.module.ts` — the operations (`list`, `load`, `verify`,
  `create`, `modify`, `remove`) plus `resolveListStatus` for
  `list --status valid|invalid`. Structured in, data out: no argv, no output.
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
- **`--target` (alias `--dir`) overrides the workspace root**, not the skills
  directory: the store always reads `<root>/.agents/skills`. Default is the
  working directory.
- **A non-zero exit is set inside the handler** via `exitFailed`, not by failing
  the handler. Failing would make `Command.run` render a second error report on
  top of ours. `process.exitCode` rather than `process.exit` leaves stdout to
  flush when piped.
- **Verification is mechanical and pure.** `verify [name]` checks one skill or
  every skill under the root; a directory without a readable `SKILL.md` counts
  as invalid rather than aborting the run.
- **The slash parser is the binary's grammar.** Every known command validates
  its flags and positionals before running: a value flag with no value is
  usage, extra (or missing) positionals are usage, and boolean values are
  exactly `true|yes|on|1|y` and `false|no|off|0|n` (no case folding). A bare
  boolean may take the next token only when it is one of those literals, so
  `verify --verbose alpha` is `verbose: true` plus the name `alpha`. Malformed
  known commands return `Help` with `invalid: true`, which `run` fails with
  `USAGE`; bare or unknown commands stay successful help.
- **The lexer is `effect/cli`'s.** Any token starting with `-` except a bare
  `-` is a flag token, so `--description -x` is a missing value (and `-x` an
  unknown flag) rather than a value; `--` ends flag parsing and leaves the rest
  positional (`delete -- alpha`); empty quoted tokens survive (`--description
""` is a real empty value); a duplicated flag keeps its first value, as the
  binary does.
- **Relative paths resolve against the session directory.** `run` resolves
  every `--dir`, `--source`, and `--target` once with
  `path.resolve(cwd, value)` before any engine sees it, so a relative flag
  never falls through to the host process's launch directory. Engines receive
  absolute roots; an absent `--target` still means `cwd`.

## Does not belong here

- Skill shapes, codecs, and verification — `../../modules/skill/`
- File IO — `../../modules/skill-store/`
- Doctor — [../doctor](../doctor/CONTEXT.md)
- Sync classification, outcomes, and copying — [../sync](../sync/CONTEXT.md); the
  front ends only parse flags, resolve defaults, and render
- Dialog flows — [../interactive](../interactive/CONTEXT.md)
- Agentic sessions — [../sessions](../sessions/CONTEXT.md)

## Running

```bash
# from source (Bun required)
bun run --cwd packages/skills cli list
bun run --cwd packages/skills cli verify <name> --dir $PWD

# standalone binary — Bun runtime embedded, no install, no node
bun run --cwd packages/skills build:cli
./packages/skills/dist/mf-skills list --verbose
```

`build:cli` is `bun build --compile`, preceded by `generate:payload` so the
bundle carries the skill-authoring skills (see [doctor](../doctor/CONTEXT.md)).
`dist/` is gitignored; the binary is a build artifact.
