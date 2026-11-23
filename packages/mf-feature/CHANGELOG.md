# Changelog

Releases: this package is versioned and tagged by changesets but never published to npm; run the CLIs from a git checkout.

## Unreleased

### Added

- `mf-feature doctor [--check]` installs the `mf-feature` and `mf-feature-*` skills and the `mf-feature-generic-worker` and `mf-feature-comment-sicko` profiles this package now ships
- The `mf-feature` CLI over the per-user `.agents/@montflow/feature/roles.json`: `roles [show]`, `roles set <role> --seat <spec>…`, `roles unset <role>`, `roles verify`, and `roles resolve <role>`, with agent-first `key=value` output plus `--human` and `--verbose`
- `roles verify` and `roles set` reject unknown roles and fields, several seats outside a panel, and any model or effort its harness does not run (`fable` under `codex`)
- `roles resolve` marks each seat `native`, `dispatch`, or `dropped` from the current harness, detected from the environment or given with `--harness`, and ends each line with the one next step
- `dispatch <role> --seat <n> --brief <file>` runs a dispatch seat headless (`claude -p`, `codex exec`, `opencode run`, `pi -p`) as a profile, `--read-only` or not, with `--dry-run` to print the command
