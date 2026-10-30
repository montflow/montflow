# Changelog

## 0.0.2

### Patch Changes

- [#8](https://github.com/montflow/montflow/pull/8) [`f499e05`](https://github.com/montflow/montflow/commit/f499e05787abf1154d411836d68073c258ff8a49) Thanks [@DanielMontilla](https://github.com/DanielMontilla)! - First tracked release of the five `mf-*` CLIs. They are versioned and tagged
  together in one fixed group and are still never published to npm; the version
  exists so `mf-<cli> version` and the update check have something to compare.

Releases: this package is versioned and tagged by changesets but never published to npm; run the CLIs from a git checkout.

## [Unreleased]

### Added

- `mf-skills sync`: copies every public skill from a source checkout into `<target>/.agents/skills/<name>/`, carrying each file in the skill directory (`SKILL.md`, `CHANGELOG.md`, `GATES.md`, and any other file present).
- `--source <path>` picks the source checkout, defaulting to the montflow checkout the package runs from; `--target <path>` picks the target workspace root, defaulting to the working directory.
- `--from` and `--dir` stay as aliases for `--source` and `--target`; the canonical flag wins when both are given.
- `--check` reports the same outcomes without writing and exits `1` on drift; `--verbose` also reports per-file outcomes.
- One shared sync engine behind both the `mf-skills sync` binary and the `/mf-skills sync` slash command — no domain rule lives in a front end, and refusals name the typeable form for that surface.
- Sync reports a `Synced`/`Checked <source> → <target>` header, groups skills as `Created`, `Updated`, `Unchanged`, and `Skipped`, omits empty groups, and ends with a compact count line plus a `✓ current.` or `✗ drift` verdict for `--check`. A `SKILL.md` with `metadata.internal: true` is skipped, reported with its reason, and never copied, while unrelated existing skills are left untouched.
