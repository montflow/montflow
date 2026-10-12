# Changelog

## [1.5.0] - 2026-10-12

### Added

- New Step 1 gathers worktree parameters before creation: type (feature, fix, hotfix, refactor, etc.), name, origin/base branch, and whether to push
- Worktree path and branch now use the typed `<prefix>/<name>` form (e.g. `feat/<name>`)
- Optional Step 3 pushes the new branch to `origin` (`git push -u origin <branch>`) when requested

### Changed

- Git fallback creates the worktree from the chosen base branch (`git worktree add <path> -b <branch> <base>`) instead of always branching from `HEAD`
- Native-tool branch (2a) now receives the gathered branch name and base when supported
- Renumbered creation, project setup, and baseline steps

## [1.4.0] - 2026-10-07

### Changed

- Added missing `author` and `license` frontmatter fields
- Renamed the `# Using Git Worktrees` body heading to `# Pipeline` and added `# Reference` (schema conformance)
- Fixed the malformed frontmatter description

## [1.3.0] - 2026-07-24

### Added

- Added required `id` field to frontmatter
