# CLI

The shared binary surface for `@montflow/version`: resolve one CLI's identity,
attach the `version` subcommand, and run the command tree.

## Belongs here

- `run`, the entry-point runner every `mf-*` `main.ts` calls.
- The `version` subcommand and its `--json` / `--dir` flags.
- Human and JSON rendering of identity plus the workspace store version.
- Keeping `--version` and `version` on the same resolved identity.

## Does not belong here

- Per-CLI command trees; each package owns its own root command.
- Slash-command surfaces, which consume engines rather than the binary runner.
- Drift comparison or update checks.
