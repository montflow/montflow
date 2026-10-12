# CLI apps module

`mf-sessions` — the non-interactive surface over the shared engine.

## Belongs here

- `runCli(argv, root)` — parse (argv-aware) + execute; a lone `--version`/`-v`
  prints the version without touching the engine
- `resolveRepoRoot(startDir)` — nearest ancestor with a `.git` entry, so sessions
  are always rooted at the repository
- `COMMAND_NAME` / `COMMAND_DESCRIPTION` / `USAGE` — re-exported from `apps/commands`
- `main.ts` — bun bin entry; builds the console-bridge session runner layer

## Rules

- One invocation = one action; `start` blocks until the session settles.
- `resume`/`interrupt` mirror the engine verbs.
- `steer`/`answer` need a live session in-process; a fresh CLI process reports the
  engine's "not live" error (interactive steering is the extension's job).
- Never prompts.

## Does not belong here

- Command parsing/execution — `apps/commands`
- Layer construction — `apps/runtime`
