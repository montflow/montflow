# Changelog

## [1.1.0] - 2026-07-24

### Added

- Added required `id` field to frontmatter

## [1.0.2] - 2026-07-14

### Changed

- `Create feature worktree` step rewritten to delegate all isolation to `using-git-worktrees` instead of running `git worktree add` directly; passes branch `feat/<feature-name>` to keep `authoring-feature-spec` step 0 feature-worktree recognition consistent

### Fixed

- No longer spawns a nested worktree when already inside a linked worktree; authors in place instead

## [1.0.1] - 2026-07-14

### Changed

- Updated `finding-vendors` dependency to `finding-references` in frontmatter

## [1.0.0] - 2026-07-11

### Added

- Initial release as worktree variant of authoring-feature-spec
- Workspace creation pipeline: detection, feature worktree creation, initialization, relocation
- Delegation to authoring-feature-spec for spec design, phases, gates, and file generation
