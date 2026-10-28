# CLI

The shared binary surface for `@montflow/version`: run one CLI's command tree
and render its build identity plus the installed store version.

## Belongs here

- `run`, the entry-point runner every `mf-*` `main.ts` calls.
- `versionCommand`, registered by each package in its own command tree so that
  tree's `Command.provide` layers stay in force.
- The `version` subcommand and its `--json` / `--dir` flags.
- `versionReport`, the single resolver for identity plus store state.
- Human and JSON rendering of identity plus the workspace store version.
- Printing a non-`CliError` failure to stderr before a non-zero exit.

## Does not belong here

- Per-CLI command trees; each package owns its own root command.
- Slash-command surfaces, which consume engines rather than the binary runner.
- Drift comparison or update checks.

## Identity sources

- `--version` reports the version the package's `package.json` contributes at
  build time (`PACKAGE_IDENTITY`), so it needs no probe.
- `version` resolves the full identity through `BuildInfo.describe`, including
  git facts and the embedded generated fallback for compiled binaries.
- Both read the same manifest value, but they are not the same call.
