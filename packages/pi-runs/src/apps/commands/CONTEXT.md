# Commands apps module

Shared surface commands: parse `/mf-runs` / `mf-runs` args and execute them
against the `Runner`. CLI and extension delegate here so verbs/output never
drift.

## Belongs here

- `parseCommand` — quote-aware tokenizer + `--flag value|--flag=value` split
- `parseArgv` — already-split argv (CLI); never re-joined, so multi-word values survive
- `execute(action, root, options)` — runs the action, returns display text
- `COMMAND_NAME` / `COMMAND_DESCRIPTION` / `USAGE` — single source for both surfaces
- `ExecuteOptions.onSettled` — A004 completion seam; E001 composes the
  `/mf-profiles-cli create` invocation here

## Rules

- Non-interactive: malformed input is `Help`, never a prompt.
- `start` awaits settlement by default (CLI); the `run_start` tool passes
  `startMode: 'detach'` so a parked child never deadlocks its parent. `await`
  is bounded by `settlementTimeout`.
- Unknown flags, extra positionals, and unterminated quotes are `Help`.
- `steer`/`answer` require a live run in the same process (extension); a fresh
  CLI process reports the engine's "not live" error.

## Does not belong here

- Engine behavior — `Runner`
- Surface wiring (Pi commands/tools, CLI argv) — `extension.ts` and `apps/cli`
