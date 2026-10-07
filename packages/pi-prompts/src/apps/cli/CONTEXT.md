# CLI app

Two front ends over one set of engines: the `mf-prompts` binary (Bun +
`effect/unstable/cli`) and the Pi slash command of the same name. A hand-rolled
parser for the slash form, a `Command` tree for the binary, and nothing shared
below the parser.

## Belongs here

- `engines.apps.module.ts` — the operations (`list`, `load`, `verify`,
  `inspect`, `render`, `plan`, `doctor`, `create`, `modify`, `remove`) plus the
  shared input grammars: `keyValues` for `key=value` positionals,
  `parseVariableSpec` for `name[:o|d=…]`, and `resolveListStatus` for
  `list --status valid|invalid`
- `renderers.apps.module.ts` — pure `data -> text`, carrying the **token
  contract** (lean by default, `--verbose` only adds, failures never suppressed)
- `binary.apps.module.ts` — the `Command` tree and `rootCommand`
- `slash.apps.module.ts` — the `/mf-prompts` parser, `run`, and `register`
- `main.ts` — the binary entry

The interactive menu is a different command: `/mf-prompts-tui`,
`../interactive/`.

## Rules

- **Engines know nothing about argv or output.** They take structured
  arguments, return data, and fail with a displayable string. That is what lets
  the binary and the slash command share behaviour rather than duplicate it —
  the duplication this module replaced.
- **The skills gate lives in `engines.plan`, not a front end.** "You may not
  start a run on stale guidance" is a domain rule; putting it in the engine is
  what stops one surface growing a private way around it. The gate is
  read-only, so resolving a plan never mutates the repository.
- **`invocation` is threaded into every refusal.** The two front ends spell the
  same action differently (`mf-prompts execute` vs `/mf-prompts execute`),
  and fix-it advice naming a form the reader cannot type is worse than none.
- **The binary does not execute.** It has no `ModelRuntime`; `prompt_execute`
  and the slash command own that. So `mf-prompts execute` validates, renders,
  and prints what _would_ be sent. Its own description says so.
- **A non-zero exit is set inside the handler** via `exitFailed`, not by failing
  the handler. Failing would make `Command.run` render a second error report on
  top of ours, so the reader would see the same failure twice. `process.exitCode`
  rather than `process.exit` leaves stdout to flush when piped.

## Does not belong here

- Prompt shapes, codecs, rendering, and verification — `../../modules/prompts/`
- The variable table and the execute planner — `../../modules/prompt-execute/`,
  which both front ends call so they cannot disagree
- Dialog flows — [interactive](../interactive/CONTEXT.md)
- Running an agent — the `PromptExecutor` port, injected by the extension
- Persistence — the `PromptStore` service, provided as `live` at invocation

## Running

```bash
# from source (Bun required)
bun run --cwd packages/pi-prompts cli list
bun packages/pi-prompts/src/apps/cli/main.ts verify commit   # no --cwd: cwd is the store root

# standalone binary — Bun runtime embedded, no install, no node
bun run --cwd packages/pi-prompts build:cli
./packages/pi-prompts/dist/mf-prompts list --verbose
```

`build:cli` is `bun build --compile`, preceded by `generate:payload` so the
bundle carries the prompt skills (see [doctor](../doctor/CONTEXT.md)).
Cross-compile with `-- --target=bun-linux-x64`, `bun-darwin-arm64`,
`bun-windows-x64`, and so on. `bun --cwd` changes the working directory, so run
the source form from the repository root when you want the repo's own prompt
store.

`dist/` is gitignored; the binary is a build artifact, not a source file.

Every subcommand works from a compiled binary with no package checkout present,
`doctor` and `execute` included — the skills payload is embedded in the bundle.
