# Changelog

Releases: this package is versioned and tagged by changesets but never published to npm; run the CLIs from a git checkout.

## Unreleased

### Changed

- Renamed from `@montflow/feature` / `mf-feature` to `@montflow/mode` / `mf-mode`: the `mf-feature` and `mf-feature-*` skills are now `mf-mode` and `mf-mode-*`, the profiles `mf-mode-generic-worker` and `mf-mode-comment-sicko`, the roles file `.agents/@montflow/mode/roles.json` (move an existing `.agents/@montflow/feature/roles.json` there), and the harness override `MF_MODE_HARNESS`
- `@montflow/principles` and `@montflow/playbooks` are folded into this package: the `mf-principles` and `mf-playbooks` CLIs are now `mf-mode principles` and `mf-mode playbooks` (`list`, `show`, `verify`), and one `mf-mode doctor` installs the skills, profiles, principles and playbooks and one `mf-mode verify` checks the roles file, the principles and the playbooks

### Added

- `mf-feature doctor [--check]` installs the `mf-feature` and `mf-feature-*` skills and the `mf-feature-generic-worker` and `mf-feature-comment-sicko` profiles this package now ships
- The `mf-feature` CLI over the per-user `.agents/@montflow/feature/roles.json`: `roles [show]`, `roles set <role> --seat <spec>…`, `roles unset <role>`, `roles verify`, and `roles resolve <role>`, with agent-first `key=value` output plus `--human` and `--verbose`
- `roles verify` and `roles set` reject unknown roles and fields, several seats outside a panel, and any model or effort its harness does not run (`fable` under `codex`)
- `roles resolve` marks each seat `native`, `dispatch`, or `dropped` from the current harness, detected from the environment or given with `--harness`, and ends each line with the one next step
- `dispatch <role> --seat <n> --brief <file>` runs a dispatch seat headless (`claude -p`, `codex exec`, `opencode run`, `pi -p`) as a profile, `--read-only` or not, with `--dry-run` to print the command
