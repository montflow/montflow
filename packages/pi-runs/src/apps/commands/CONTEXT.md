# Commands apps module

Shared surface commands: parse `/mf-runs` / `mf-runs` args and execute them
against the `Runner`. CLI and extension delegate here so verbs/output never
drift.

## Belongs here

- `parseCommand` — quote-aware tokenizer + `--flag value|--flag=value` split
- `parseArgv` — already-split argv (CLI); never re-joined, so multi-word values survive
- `execute(action, root, options)` — runs the action, returns display text;
  `status` also renders the store's git-ignore verdict (`Runner.verifyStore`)
- `COMMAND_NAME` / `COMMAND_DESCRIPTION` / `USAGE` — single source for both surfaces
- `start` flags: `--model` (`provider/model-id`) and `--thinking`
  (`off|minimal|low|medium|high|xhigh|max`); an unknown level is `Help`
- `list` flag: `--status` (`pending|running|awaiting-input|done|failed|cancelled`,
  comma-separated) keeps only matching runs; an unknown status fails with the
  accepted values
- `Doctor` action — delegates to `apps/doctor` (`runDoctor`), which installs the
  packaged `montflow-dispatch-pi-runs` skill into `.agents/skills/`
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
