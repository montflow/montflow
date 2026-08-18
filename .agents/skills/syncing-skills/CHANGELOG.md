## [3.0.0] - 2026-08-18

### Changed

- Complete rewrite: no longer copies files from this repo. Now a guided installer — reads the repo's available skills via `npx skills add montflow/montflow --list`, presents them for selection, and installs the chosen ones with `npx skills add ... -s <skill>`.
- Removed version conflict resolution, changelog preservation, sparse checkout, and subagent orchestration (obsolete with CLI-driven installs)

## [2.2.2] - 2026-08-17

### Added

- `metadata.internal: true` frontmatter — the `skills` CLI now excludes this skill from discovery, listing, and installs. Force-install via `-s syncing-skills` or `INSTALL_INTERNAL_SKILLS=1`.

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
