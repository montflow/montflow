## [4.0.0] - 2026-10-26

### Changed

- Switched the flow from the external skills installer to the in-repo `mf-skills sync` command: resolve the source checkout (local clone or a registered montflow reference), sync public skills into `<root>/.agents/skills/` with `--source`/`--target` (`--from`/`--dir` remain aliases), and verify with `--check`.
- Sync is project-local only: removed every global-install instruction, `-g` flag, agent-target table, and external-CLI maintenance command.
- Documented the public/internal split — `metadata.internal: true` skills are skipped, reported, and never copied.
- Earlier entries reworded to name the external skills CLI rather than its invocation; the installer is no longer used.

## [3.0.0] - 2026-08-18

### Changed

- Complete rewrite: no longer copies files from this repo. Now a guided installer — reads the repo's available skills through the external skills CLI, presents them for selection, and installs the chosen ones.
- Removed version conflict resolution, changelog preservation, sparse checkout, and subagent orchestration (obsolete with CLI-driven installs)

## [2.2.2] - 2026-08-17

### Added

- `metadata.internal: true` frontmatter — the external skills CLI excludes this skill from discovery, listing, and installs.

## [2.2.1] - 2026-08-17

### Fixed

- Source repo URLs DanielMontilla/* → montflow/montflow

## [2.2.0] - 2026-08-12

### Changed

- AGENTS.md table generation in target is now optional — ask user first (per setup-agentic-repo)
- Fixed stale path in GATES.md Phase 2: `$TARGET/.agents/skills/AGENTS.md` → `$TARGET/AGENTS.md`
- Dropped "matching this repo's convention" claim — this repo keeps AGENTS.md table-free

## [2.1.0] - 2026-07-24

### Added

- Added required `id` field to frontmatter
