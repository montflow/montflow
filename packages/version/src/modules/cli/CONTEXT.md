# CLI

The shared binary surface for `@montflow/version`: run one CLI's command tree,
render its build identity plus the installed store version, and print the one
stale notice.

## Belongs here

- `run`/`execute`, the entry-point runner every `mf-*` `main.ts` calls.
- `versionCommand`, registered by each package in its own command tree so that
  tree's `Command.provide` layers stay in force.
- The `version` subcommand: `--json`, `--dir`, and `--check`.
- `versionReport`, the single resolver for identity plus store state.
- Human and JSON rendering of identity plus the workspace store version.
- The notice: `announce`, `shouldAnnounce`, `noticeLine`, `cliName`, and the
  `version --check` verdict line/exit mapping.
- Stripping `--no-update-check` before `effect/cli` parses argv.
- Printing a non-`CliError` failure to stderr before a non-zero exit.

## Does not belong here

- Per-CLI command trees; each package owns its own root command.
- Slash-command surfaces, which consume engines rather than the binary runner.
- The update-check engine (`check`, cache, probe); the CLI only renders it.

## Identity sources

- `--version` reports the version the package's `package.json` contributes at
  build time (`PACKAGE_IDENTITY`).
- `version` resolves the full identity through `BuildInfo.describe`, including
  git facts and the embedded generated fallback for compiled binaries.
- The notice resolves the same identity only when the check is not opted out,
  so `CI=true` and `--no-update-check` avoid the git probes entirely.
